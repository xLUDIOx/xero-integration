import { FxRates, Payhawk, Xero } from '@services';
import { EntityType } from '@shared';
import { ISchemaStore } from '@stores';
import { ILogger } from '@utils';

import * as XeroEntities from '../xero-entities';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly store: ISchemaStore,
        private readonly payhawkClient: Payhawk.IClient,
        private readonly xeroEntities: XeroEntities.IManager,
        private readonly fxRateService: FxRates.IService,
        private readonly deleteFile: (filePath: string) => Promise<void>,
        private readonly accountId: string,
        private readonly portalUrl: string,
        private readonly logger: ILogger,
    ) { }

    async synchronizeChartOfAccounts(): Promise<void> {
        const xeroAccountCodes = await this.xeroEntities.getExpenseAccounts();
        const accountCodeModels = xeroAccountCodes.map(x => ({
            code: x.code,
            name: x.name,
        }));

        await this.payhawkClient.synchronizeChartOfAccounts(accountCodeModels);
    }

    async synchronizeTaxRates(): Promise<void> {
        const xeroTaxRates = await this.xeroEntities.getTaxRates();
        const accountCodeModels = xeroTaxRates.map(x => ({
            name: x.name,
            code: x.taxType,
            rate: Number(x.effectiveRate),
        }));

        await this.payhawkClient.synchronizeTaxRates(accountCodeModels);
    }

    async synchronizeBankAccounts(): Promise<void> {
        const bankAccounts = await this.xeroEntities.bankAccounts.get();
        const bankAccountModels = bankAccounts.map(b => ({
            name: b.name,
            externalId: b.accountID,
            number: b.bankAccountNumber,
            currency: b.currencyCode.toString(),
        }));

        await this.payhawkClient.synchronizeBankAccounts(bankAccountModels);
    }

    async exportExpense(expenseId: string): Promise<void> {
        const expense = await this.payhawkClient.getExpense(expenseId);
        const files = await this.payhawkClient.downloadFiles(expense);

        try {
            if (expense.transactions.length > 0) {
                await this.exportExpenseAsTransaction(expense, files);
            } else {
                await this.exportExpenseAsBill(expense, files);
            }
        } finally {
            await Promise.all(files.map(async (f: Payhawk.IDownloadedFile) => this.deleteFile(f.path)));
        }
    }

    async deleteExpense(expenseId: string): Promise<void> {
        const expenseTransactions = await this.store.expenseTransactions.getByAccountId(this.accountId, expenseId);
        if (expenseTransactions.length === 0) {
            await this.deleteBill(expenseId);
        } else {
            const transactionIds = expenseTransactions.map(x => x.transaction_id);
            await this.deleteTransactions(expenseId, transactionIds);
        }
    }

    async exportTransfers(startDate: string, endDate: string): Promise<void> {
        const transfers = await this.payhawkClient.getTransfers(startDate, endDate);
        if (!transfers.length) {
            return;
        }

        const contactId = await this.xeroEntities.getContactIdForSupplier({ name: 'New Deposit' });

        const bankAccountIdMap = new Map<string, string>();

        for (const transfer of transfers) {
            try {
                let bankAccountId = bankAccountIdMap.get(transfer.currency);
                if (!bankAccountId) {
                    const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(transfer.currency);
                    bankAccountId = bankAccount.accountID;
                    bankAccountIdMap.set(transfer.currency, bankAccountId);
                }

                await this.exportTransferAsTransaction(transfer, contactId, bankAccountId);
            } catch (err) {
                this.logger.child({ accountId: this.accountId, transferId: transfer.id }).error(err);
            }
        }
    }

    async exportTransfer(balanceId: string, transferId: string): Promise<void> {
        const logger = this.logger.child({ accountId: this.accountId, balanceId, transferId });
        const transfer = await this.payhawkClient.getTransfer(balanceId, transferId);
        if (!transfer) {
            logger.error(Error('Transfer not found'));
            return;
        }

        const contactId = await this.xeroEntities.getContactIdForSupplier({ name: 'New Deposit' });
        try {
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(transfer.currency);
            const bankAccountId = bankAccount.accountID;
            await this.exportTransferAsTransaction(transfer, contactId, bankAccountId);
        } catch (err) {
            logger.error(err);
        }
    }

    async getOrganisationName(): Promise<string> {
        const organisation = await this.xeroEntities.getOrganisation();
        return organisation.name;
    }

    async exportBankStatementForExpense(expenseId: string): Promise<void> {
        const logger = this.logger.child({ accountId: this.accountId, expenseId });
        const expense = await this.payhawkClient.getExpense(expenseId);
        if (expense.transactions.length === 0) {
            await this.exportBankStatementForBill(expense, logger);
        } else {
            await this.exportBankStatementForTransactions(expense, logger);
        }
    }

    async exportBankStatementForTransfer(balanceId: string, transferId: string): Promise<void> {
        let logger = this.logger.child({ accountId: this.accountId, balanceId, transferId });
        const transfer = await this.payhawkClient.getTransfer(balanceId, transferId);
        if (!transfer) {
            logger.error(Error('Transfer not found'));
            return;
        }

        const date = transfer.date;
        const currency = transfer.currency;
        const transferUrl = this.buildTransferUrl(transferId, new Date(date));

        logger = logger.child({ currency, transferUrl });

        const bankTransaction = await this.xeroEntities.getBankTransactionByUrl(transferUrl);
        if (!bankTransaction) {
            logger.error(Error('Bank statement cannot be imported because the deposit associated with it was not found'));
            return;
        }

        if (bankTransaction.isReconciled) {
            logger.error(Error('Bank transaction is reconciled'));
            return;
        }

        let statementId = await this.store.bankFeeds.getStatementIdByEntityId({
            account_id: this.accountId,
            xero_entity_id: bankTransaction.bankTransactionID,
            payhawk_entity_id: transferId,
            payhawk_entity_type: EntityType.Transfer,
        });

        if (statementId) {
            logger.info('Statement for this transfer is already exported');
            return;
        }

        const contactName = bankTransaction.contact.name;
        const description = bankTransaction.reference;

        let feedConnectionId = await this.store.bankFeeds.getConnectionIdByCurrency(this.accountId, currency);
        if (!feedConnectionId) {
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
            feedConnectionId = await this.xeroEntities.bankFeeds.getOrCreateConnection(bankAccount);
            await this.store.bankFeeds.createConnection(
                {
                    account_id: this.accountId,
                    bank_connection_id: feedConnectionId,
                    currency: bankAccount.currencyCode.toString(),
                },
            );
        }

        statementId = await this.xeroEntities.bankFeeds.createBankStatementLine(
            feedConnectionId,
            bankTransaction.bankTransactionID,
            date,
            -Math.abs(transfer.amount),
            contactName!,
            description,
        );

        await this.store.bankFeeds.createStatement({
            account_id: this.accountId,
            xero_entity_id: bankTransaction.bankTransactionID,
            payhawk_entity_id: transferId,
            payhawk_entity_type: EntityType.Transfer,
            bank_statement_id: statementId,
        });
    }

    private async exportExpenseAsTransaction(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[]) {
        const actualTransactionIds = expense.transactions.map(t => t.id);
        await this.deleteOldExpenseTransactions(expense.id, actualTransactionIds);

        // common data for all transactions linked to the expense
        const currency = expense.transactions[0].cardCurrency;
        const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
        const bankAccountId = bankAccount.accountID;
        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const bankTransactionIds = [];

        for (const t of expense.transactions) {
            const bankTransactionId = await this.exportTransaction(expense, t, bankAccountId, contactId, files);
            bankTransactionIds.push(bankTransactionId);
        }

        const organisation = await this.xeroEntities.getOrganisation();

        const transactionUrls = bankTransactionIds.map(id => XeroEntities.getTransactionExternalUrl(organisation.shortCode, id));
        await this.updateExpenseLinks(expense.id, transactionUrls);
    }

    private async exportTransaction(expense: Payhawk.IExpense, transaction: Payhawk.ITransaction, bankAccountId: string, contactId: string, files: Payhawk.IDownloadedFile[]): Promise<string> {
        const totalAmount = transaction.cardAmount + transaction.fees;
        const description = formatDescription(formatCardDescription(transaction.cardHolderName, transaction.cardLastDigits, transaction.cardName), expense.note);
        const date = getTransactionExportDate(transaction);
        const newAccountTransaction: XeroEntities.INewAccountTransaction = {
            date,
            bankAccountId,
            contactId,
            description,
            reference: transaction.description,
            totalAmount,
            accountCode: expense.reconciliation.accountCode,
            taxType: expense.taxRate ? expense.taxRate.code : undefined,
            files,
            url: this.buildTransactionUrl(transaction.id, new Date(date)),
        };

        const bankTransactionId = await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);

        await this.store.expenseTransactions.create(this.accountId, expense.id, transaction.id);

        return bankTransactionId;
    }

    private async deleteOldExpenseTransactions(expenseId: string, actualTransactionIds: string[]) {
        const exportedTransactions = await this.store.expenseTransactions.getByAccountId(this.accountId, expenseId);
        if (exportedTransactions.length === 0) {
            return;
        }

        const exportedTransactionIds = exportedTransactions.map(t => t.transaction_id);
        for (const transactionId of actualTransactionIds) {
            if (!exportedTransactionIds.includes(transactionId)) {
                await this.deleteTransaction(expenseId, transactionId);
            }
        }
    }

    private async exportTransferAsTransaction(transfer: Payhawk.IBalanceTransfer, contactId: string, bankAccountId: string): Promise<void> {
        const date = transfer.date;
        const newAccountTransaction: XeroEntities.INewAccountTransaction = {
            date,
            bankAccountId,
            contactId,
            reference: `Bank wire received on ${new Date(date).toUTCString()}`,
            totalAmount: -Math.abs(transfer.amount),
            files: [],
            url: this.buildTransferUrl(transfer.id, new Date(date)),
        };

        await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);
    }

    private async exportExpenseAsBill(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[]) {
        const date = getBillExportDate(expense);

        const expenseCurrency = expense.reconciliation.expenseCurrency;
        if (!expenseCurrency) {
            this.logger.info('Expense will not be exported because it does not have currency');
            return;
        }

        const totalAmount = expense.reconciliation.expenseTotalAmount;
        if (totalAmount === 0) {
            this.logger.info('Expense amount is 0, nothing to export');
            return;
        }

        let fxRate: number | undefined;
        let bankAccountId: string | undefined;

        const organisation = await this.xeroEntities.getOrganisation();

        if (expense.isPaid) {
            if (expense.paymentData.source) {
                const potentialBankAccountId = expense.paymentData.source;
                const bankAccount = await this.xeroEntities.bankAccounts.getById(potentialBankAccountId);

                if (bankAccount) {
                    const bankAccountCurrency = bankAccount.currencyCode.toString();

                    if (expenseCurrency === bankAccountCurrency.toString()) {
                        bankAccountId = potentialBankAccountId;
                    } else {
                        const organisationBaseCurrency = organisation.baseCurrency.toString();
                        if (organisationBaseCurrency === bankAccountCurrency) {
                            fxRate = await this.fxRateService.getByDate(
                                organisationBaseCurrency.toString(),
                                expenseCurrency,
                                new Date(date),
                            );

                            bankAccountId = potentialBankAccountId;
                        }
                    }
                }
            } else {
                const bankAccount = await this.xeroEntities.bankAccounts.getByCurrency(expenseCurrency);
                if (bankAccount) {
                    bankAccountId = bankAccount.accountID;
                }
            }
        }

        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const description = formatDescription(expense.ownerName, expense.note);

        const newBill: XeroEntities.INewBill = {
            bankAccountId,
            date,
            dueDate: expense.paymentData.dueDate || date,
            paymentDate: expense.isPaid ? (expense.paymentData.date || date) : undefined,
            isPaid: expense.isPaid,
            contactId,
            description,
            currency: expenseCurrency,
            fxRate,
            totalAmount,
            accountCode: expense.reconciliation.accountCode,
            taxType: expense.taxRate ? expense.taxRate.code : undefined,
            files,
            url: this.buildExpenseUrl(expense.id, new Date(date)),
        };

        const billId = await this.xeroEntities.createOrUpdateBill(newBill);
        const billUrl = XeroEntities.getBillExternalUrl(organisation.shortCode, billId);

        await this.updateExpenseLinks(expense.id, [billUrl]);
    }

    private async deleteBill(expenseId: string): Promise<void> {
        const billUrl = this.buildExpenseUrl(expenseId);
        await this.xeroEntities.deleteBill(billUrl);
    }

    private async deleteTransactions(expenseId: string, transactionIds: string[]): Promise<void> {
        for (const transactionId of transactionIds) {
            await this.deleteTransaction(expenseId, transactionId);
        }
    }

    private async deleteTransaction(expenseId: string, transactionId: string) {
        const transactionUrl = this.buildTransactionUrl(transactionId);
        await this.xeroEntities.deleteAccountTransaction(transactionUrl);
        await this.store.expenseTransactions.delete(this.accountId, expenseId, transactionId);
    }

    private async updateExpenseLinks(expenseId: string, urls: string[]) {
        return this.payhawkClient.updateExpense(
            expenseId,
            {
                externalLinks: urls.map(url => ({ url, title: 'Xero' })),
            },
        );
    }

    private async exportBankStatementForTransactions(expense: Payhawk.IExpense, baseLogger: ILogger): Promise<void> {
        const settledTransactions = expense.transactions.filter(t => t.settlementDate !== undefined) as Required<Payhawk.ITransaction>[];
        if (settledTransactions.length === 0) {
            return;
        }

        const currency = settledTransactions[0].cardCurrency;

        const logger = baseLogger.child({ currency });

        let feedConnectionId = await this.store.bankFeeds.getConnectionIdByCurrency(this.accountId, currency);
        if (!feedConnectionId) {
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
            feedConnectionId = await this.xeroEntities.bankFeeds.getOrCreateConnection(bankAccount);
            await this.store.bankFeeds.createConnection(
                {
                    account_id: this.accountId,
                    bank_connection_id: feedConnectionId,
                    currency: bankAccount.currencyCode.toString(),
                },
            );
        }

        for (const transaction of settledTransactions) {
            const date = transaction.settlementDate;
            const amount = transaction.cardAmount;
            const transactionUrl = this.buildTransactionUrl(transaction.id, new Date(date));

            const txLogger = logger.child({ transactionId: transaction.id, transactionUrl });
            const bankTransaction = await this.xeroEntities.getBankTransactionByUrl(transactionUrl);
            if (!bankTransaction) {
                txLogger.error(Error('Bank statement transaction not found'));
                continue;
            }

            if (bankTransaction.isReconciled) {
                txLogger.error(Error('Bank transaction is reconciled'));
                continue;
            }

            let statementId = await this.store.bankFeeds.getStatementIdByEntityId({
                account_id: this.accountId,
                xero_entity_id: bankTransaction.bankTransactionID,
                payhawk_entity_id: transaction.id,
                payhawk_entity_type: EntityType.Transaction,
            });

            if (statementId) {
                logger.info('Statement for this transaction is already exported');
                continue;
            }

            const contactName = bankTransaction.contact.name;
            const description = bankTransaction.reference;

            statementId = await this.xeroEntities.bankFeeds.createBankStatementLine(
                feedConnectionId,
                bankTransaction.bankTransactionID,
                date,
                amount,
                contactName!,
                description,
            );

            await this.store.bankFeeds.createStatement({
                account_id: this.accountId,
                xero_entity_id: bankTransaction.bankTransactionID,
                payhawk_entity_id: transaction.id,
                payhawk_entity_type: EntityType.Transaction,
                bank_statement_id: statementId,
            });
        }
    }

    private async exportBankStatementForBill(expense: Payhawk.IExpense, baseLogger: ILogger): Promise<void> {
        const expenseCurrency = expense.reconciliation.expenseCurrency;
        const logger = baseLogger.child({ currency: expenseCurrency });
        if (!expenseCurrency) {
            logger.info('Expense has no currency, nothing to export');
            return;
        }

        const expenseAmount = expense.reconciliation.expenseTotalAmount;
        if (expenseAmount === 0) {
            logger.info('Expense amount is 0, nothing to export');
            return;
        }

        const date = getBillExportDate(expense);
        const billUrl = this.buildExpenseUrl(expense.id, new Date(date));
        const bill = await this.xeroEntities.getBillByUrl(billUrl);
        if (!bill) {
            logger.error(Error('Bill not found'));
            return;
        }

        if (bill.status !== Xero.InvoiceStatus.PAID) {
            logger.info('Bill must have status PAID for bank statement export');
            return;
        }

        if (!bill.payments || bill.payments.length === 0) {
            logger.error(Error('Bill model did not contain any payments'));
            return;
        }

        const billId = bill.invoiceID;

        let statementId = await this.store.bankFeeds.getStatementIdByEntityId({
            account_id: this.accountId,
            xero_entity_id: billId,
            payhawk_entity_id: expense.id,
            payhawk_entity_type: EntityType.Expense,
        });

        if (statementId) {
            logger.info('Statement for this expense is already exported');
            return;
        }

        const payment = bill.payments[0];
        const paymentId = payment.paymentID;
        const paymentCurrencyRate = payment.currencyRate;

        let currency = expenseCurrency;
        let amount = payment.amount;
        if (paymentCurrencyRate !== 1) {
            // payment is in different currency,
            // we need to calculate amount...
            // API does not contain total calculated total amount...
            const fullPayment = await this.xeroEntities.getBillPayment(paymentId);
            if (!fullPayment) {
                logger.error(Error('Payment not found'));
                return;
            }

            currency = this.xeroEntities.bankAccounts.getCurrencyByBankAccountCode(fullPayment.account.code);
            amount = Math.round(100 * payment.amount / payment.currencyRate) / 100;
        }

        const contactName = bill.contact.name!;

        const paymentDate = payment.date;
        const description = `Payment: ${contactName}`;

        let feedConnectionId = await this.store.bankFeeds.getConnectionIdByCurrency(this.accountId, currency);
        if (!feedConnectionId) {
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
            feedConnectionId = await this.xeroEntities.bankFeeds.getOrCreateConnection(bankAccount);
            await this.store.bankFeeds.createConnection(
                {
                    account_id: this.accountId,
                    bank_connection_id: feedConnectionId,
                    currency: bankAccount.currencyCode.toString(),
                },
            );
        }

        statementId = await this.xeroEntities.bankFeeds.createBankStatementLine(
            feedConnectionId,
            billId,
            paymentDate,
            amount!,
            contactName!,
            description,
        );

        await this.store.bankFeeds.createStatement({
            account_id: this.accountId,
            xero_entity_id: billId,
            payhawk_entity_id: expense.id,
            payhawk_entity_type: EntityType.Expense,
            bank_statement_id: statementId,
        });
    }

    private buildExpenseUrl(expenseId: string, date?: Date): string {
        const accountIdQueryParam = this.getAccountIdQueryParam(date);
        return `${this.portalUrl}/expenses/${encodeURIComponent(expenseId)}?${accountIdQueryParam}=${encodeURIComponent(this.accountId)}`;
    }

    private buildTransactionUrl(transactionId: string, date?: Date): string {
        const accountIdQueryParam = this.getAccountIdQueryParam(date);
        return `${this.portalUrl}/expenses?transactionId=${encodeURIComponent(transactionId)}&${accountIdQueryParam}=${encodeURIComponent(this.accountId)}`;
    }

    private buildTransferUrl(transferId: string, date: Date): string {
        const accountIdQueryParam = this.getAccountIdQueryParam(date);
        return `${this.portalUrl}/funds?transferId=${encodeURIComponent(transferId)}&${accountIdQueryParam}=${encodeURIComponent(this.accountId)}`;
    }

    private getAccountIdQueryParam(date?: Date): 'account' | 'accountId' {
        const time = date ? date.getTime() : undefined;
        if (time === undefined || time >= TIME_AT_PARAM_CHANGE) {
            return 'account';
        }

        return 'accountId';
    }
}

function formatDescription(name: string, expenseNote?: string): string {
    return `${name}${expenseNote ? ` | ${expenseNote}` : ''}`;
}

function formatCardDescription(cardHolderName: string, cardLastDigits: string, cardName?: string): string {
    return `${cardHolderName}${cardName ? `, ${cardName}` : ''}, *${cardLastDigits}`;
}

function getBillExportDate(expense: Payhawk.IExpense): string {
    return expense.document !== undefined && expense.document.date !== undefined ? expense.document.date : expense.createdAt;
}

function getTransactionExportDate(transaction: Payhawk.ITransaction): string {
    return transaction.settlementDate || transaction.date;
}

const TIME_AT_PARAM_CHANGE = Date.UTC(2020, 0, 29, 0, 0, 0, 0);
