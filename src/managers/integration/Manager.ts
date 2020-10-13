import { FxRates, Payhawk } from '../../services';
import { IDownloadedFile, IExpense, ITransaction } from '../../services/payhawk';
import { IStore } from '../../store';
import { ILogger } from '../../utils';
import * as XeroEntities from '../xero-entities';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly store: IStore,
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

    async synchronizeBankAccounts(): Promise<void> {
        const bankAccounts = await this.xeroEntities.getBankAccounts();
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
        const expenseTransactions = await this.store.getExpenseTransactions(this.accountId, expenseId);
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
                    bankAccountId = await this.xeroEntities.getBankAccountIdForCurrency(transfer.currency);
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
            const bankAccountId = await this.xeroEntities.getBankAccountIdForCurrency(transfer.currency);
            await this.exportTransferAsTransaction(transfer, contactId, bankAccountId);
        } catch (err) {
            logger.error(err);
        }
    }

    async getOrganisationName(): Promise<string> {
        const organisation = await this.xeroEntities.getOrganisation();
        return organisation.name;
    }

    private async exportExpenseAsTransaction(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[]) {
        const actualTransactionIds = expense.transactions.map(t => t.id);
        await this.deleteOldExpenseTransactions(expense.id, actualTransactionIds);

        // common data for all transactions linked to the expense
        const currency = expense.transactions[0].cardCurrency;
        const bankAccountId = await this.xeroEntities.getBankAccountIdForCurrency(currency);
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

    private async exportTransaction(expense: IExpense, t: ITransaction, bankAccountId: string, contactId: string, files: IDownloadedFile[]): Promise<string> {
        const totalAmount = t.cardAmount + t.fees;
        const description = formatDescription(formatCardDescription(t.cardHolderName, t.cardLastDigits, t.cardName), expense.note);
        const date = t.settlementDate;
        const newAccountTransaction: XeroEntities.INewAccountTransaction = {
            date,
            bankAccountId,
            contactId,
            description,
            reference: t.description,
            totalAmount,
            accountCode: expense.reconciliation.accountCode,
            files,
            url: this.buildTransactionUrl(t.id, new Date(date)),
        };

        const bankTransactionId = await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);

        await this.store.createExpenseTransactionRecord(this.accountId, expense.id, t.id);

        return bankTransactionId;
    }

    private async deleteOldExpenseTransactions(expenseId: string, actualTransactionIds: string[]) {
        const exportedTransactions = await this.store.getExpenseTransactions(this.accountId, expenseId);
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
            reference: `Bank wire received on ${new Date(transfer.date).toUTCString()}`,
            totalAmount: -Math.abs(transfer.amount),
            files: [],
            url: this.buildTransferUrl(transfer.id, new Date(date)),
        };

        await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);
    }

    private async exportExpenseAsBill(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[]) {
        const date = (expense.document && expense.document.date) || expense.createdAt;

        const expenseCurrency = expense.reconciliation.expenseCurrency;
        if (!expenseCurrency) {
            this.logger.info('Expense will not be exported because it does not have currency');
            return;
        }

        let fxRate: number | undefined;
        let bankAccountId: string | undefined;

        const organisation = await this.xeroEntities.getOrganisation();

        if (expense.isPaid && expense.paymentData.source) {
            const potentialBankAccountId = expense.paymentData.source;
            const bankAccount = await this.xeroEntities.getBankAccountById(potentialBankAccountId);

            if (bankAccount) {
                const bankAccountCurrency = bankAccount.currencyCode;

                if (expenseCurrency === bankAccountCurrency.toString()) {
                    bankAccountId = potentialBankAccountId;
                } else {
                    const organisationBaseCurrency = organisation.baseCurrency;
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
        }

        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const description = formatDescription(expense.ownerName, expense.note);

        const totalAmount = expense.reconciliation.expenseTotalAmount;
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
        await this.store.deleteExpenseTransaction(this.accountId, expenseId, transactionId);
    }

    private async updateExpenseLinks(expenseId: string, urls: string[]) {
        return this.payhawkClient.updateExpense(
            expenseId,
            {
                externalLinks: urls.map(url => ({ url, title: 'Xero' })),
            },
        );
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
        const time = date?.getTime();
        if (!time || time >= TIME_AT_PARAM_CHANGE) {
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

const TIME_AT_PARAM_CHANGE = Date.UTC(2020, 0, 29, 0, 0, 0, 0);
