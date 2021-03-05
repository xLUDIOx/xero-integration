import { Decimal } from 'decimal.js';

import { FxRates, Payhawk, Xero } from '@services';
import { BankFeedConnectionErrorType, BankStatementErrorType, DEFAULT_ACCOUNT_NAME, EntityType, FEES_ACCOUNT_NAME, IFeedConnectionError, IRejectedBankStatement } from '@shared';
import { ISchemaStore } from '@stores';
import { ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX, ARCHIVED_BANK_ACCOUNT_MESSAGE_REGEX, DEFAULT_FEES_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE, DEFAULT_GENERAL_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE, EXPENSE_RECONCILED_ERROR_MESSAGE, ExportError, ILogger, INVALID_ACCOUNT_CODE_MESSAGE_REGEX, isBeforeDate, LOCK_PERIOD_ERROR_MESSAGE, myriadthsToNumber, numberToMyriadths } from '@utils';

import * as XeroEntities from '../xero-entities';
import { IManager, ISyncResult } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly accountId: string,
        private readonly tenantId: string,
        private readonly portalUrl: string,
        private readonly store: ISchemaStore,
        private readonly xeroEntities: XeroEntities.IManager,
        private readonly payhawkClient: Payhawk.IClient,
        private readonly fxRateService: FxRates.IService,
        private readonly deleteFile: (filePath: string) => Promise<void>,
        private readonly logger: ILogger,
    ) { }

    async initialSynchronization(): Promise<ISyncResult> {
        const account = await this.store.accounts.get(this.accountId);
        if (!account) {
            return {
                isCompleted: false,
            };
        }

        if (account.tenant_id !== this.tenantId) {
            this.logger.info('Account initial tenant id is not the same, skipping initialization');
            return {
                isCompleted: false,
                message: 'No data has been exported into Xero because initially you had connected your account to another organization',
            };
        }

        const result: ISyncResult = {
            isCompleted: true,
            data: {
                errors: {},
            },
        };

        let isSuccessful = true;

        try {
            this.logger.info(`Sync tax rates started`);
            const taxRatesCount = await this.synchronizeTaxRates();
            this.logger.info(`Completed`);

            result.data!.taxRatesCount = taxRatesCount;
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Sync tax rates failed'), { error: err });

            result.data!.errors!.taxRates = 'Sync tax rates failed';
        }

        try {
            this.logger.info(`Sync chart of accounts started`);
            result.data!.accountCodesCount = await this.synchronizeChartOfAccounts();
            this.logger.info(`Completed`);
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Sync chart of accounts failed'), { error: err });

            result.data!.errors!.accountCodes = 'Sync chart of accounts failed';
        }

        try {
            this.logger.info(`Sync bank accounts started`);
            const currencies = await this.synchronizeBankAccounts();
            this.logger.info(`Completed`);

            result.data!.bankAccounts = currencies;
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Sync bank accounts failed'), { error: err });

            result.data!.errors!.bankAccounts = 'Sync bank accounts failed';
        }

        try {
            this.logger.info(`Creating default expense accounts`);
            await this.xeroEntities.ensureDefaultExpenseAccountsExist();
            this.logger.info(`Completed`);

            result.data!.expenseAccounts = [DEFAULT_ACCOUNT_NAME, FEES_ACCOUNT_NAME];
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Create default expense accounts failed'), { error: err });

            result.data!.errors!.expenseAccounts = 'Creating default expense accounts failed';
        }

        if (isSuccessful && !account.initial_sync_completed) {
            await this.store.accounts.update(this.accountId, true);
        }

        return result;
    }

    async synchronizeChartOfAccounts(): Promise<number> {
        const xeroAccountCodes = await this.xeroEntities.getExpenseAccounts();
        const accountCodeModels = xeroAccountCodes.map(x => ({
            code: x.code,
            name: x.name,
            defaultTaxCode: x.taxType,
        }));

        await this.payhawkClient.synchronizeChartOfAccounts(accountCodeModels);

        return xeroAccountCodes.length;
    }

    async synchronizeTaxRates(): Promise<number> {
        const xeroTaxRates = await this.xeroEntities.getTaxRates();
        const accountCodeModels = xeroTaxRates.map(x => ({
            name: x.name,
            code: x.taxType,
            rate: Number(x.effectiveRate),
        }));

        await this.payhawkClient.synchronizeTaxRates(accountCodeModels);

        return xeroTaxRates.length;
    }

    async synchronizeBankAccounts(): Promise<string[]> {
        // push
        const payhawkAccounts = await this.payhawkClient.getBankAccounts();
        const uniqueCurrencies = new Set(payhawkAccounts.map(x => x.currency));
        for (const currency of uniqueCurrencies) {
            await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
        }

        // then pull
        const bankAccounts = await this.xeroEntities.bankAccounts.get();
        const bankAccountModels = bankAccounts.map(b => ({
            name: b.name,
            externalId: b.accountID,
            number: b.bankAccountNumber,
            currency: b.currencyCode.toString(),
        }));

        await this.payhawkClient.synchronizeBankAccounts(bankAccountModels);

        return Array.from(uniqueCurrencies);
    }

    async exportExpense(expenseId: string): Promise<void> {
        const expense = await this.payhawkClient.getExpense(expenseId);
        const files = await this.payhawkClient.downloadFiles(expense);

        const organisation = await this.getOrganisation();

        try {
            if (expense.transactions.length > 0) {
                await this.exportExpenseAsTransaction(expense, files, organisation);
            } else {
                await this.exportExpenseAsBill(expense, files, organisation);
            }
        } catch (err) {
            this.handleExportError(err, expense.category, GENERIC_EXPENSE_EXPORT_ERROR_MESSAGE);
        } finally {
            await Promise.all(files.map(async (f: Payhawk.IDownloadedFile) => this.deleteFile(f.path)));
        }
    }

    async deleteExpense(expenseId: string): Promise<void> {
        const logger = this.logger.child({ expenseId });

        try {
            const expenseTransactions = await this.store.expenseTransactions.getByAccountId(this.accountId, expenseId);
            if (expenseTransactions.length === 0) {
                await this.deleteBillIfExists(expenseId, logger);
            } else {
                const transactionIds = expenseTransactions.map(x => x.transaction_id);
                await this.deleteTransactions(expenseId, transactionIds, logger);
            }
        } catch (err) {
            this.handleExpenseDeleteError(err);
        }
    }

    async exportTransfers(startDate: string, endDate: string): Promise<void> {
        const logger = this.logger.child({ accountId: this.accountId, startDate, endDate });
        const organisation = await this.getOrganisation();

        const transfers = await this.payhawkClient.getTransfers(startDate, endDate);
        if (!transfers.length) {
            logger.info('There are no transfers for the selected period');
            return;
        }

        const contactId = await this.xeroEntities.getContactIdForSupplier({ name: NEW_DEPOSIT_CONTACT_NAME });

        const bankAccountIdMap = new Map<string, string>();

        for (const transfer of transfers) {
            const transferLogger = logger.child({ transferId: transfer.id });

            try {
                this.validateExportDate(organisation, transfer.date, transferLogger);

                let bankAccountId = bankAccountIdMap.get(transfer.currency);
                if (!bankAccountId) {
                    const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(transfer.currency);
                    bankAccountId = bankAccount.accountID;
                    bankAccountIdMap.set(transfer.currency, bankAccountId);
                }

                await this.exportTransferAsTransaction(transfer, contactId, bankAccountId);
            } catch (err) {
                transferLogger.error(err);
            }
        }
    }

    async exportTransfer(balanceId: string, transferId: string): Promise<void> {
        try {
            const logger = this.logger.child({ accountId: this.accountId, balanceId, transferId });
            const transfer = await this.payhawkClient.getTransfer(balanceId, transferId);
            if (!transfer) {
                throw logger.error(Error('Transfer not found'));
            }

            const organisation = await this.getOrganisation();
            this.validateExportDate(organisation, transfer.date, logger);

            const contactId = await this.xeroEntities.getContactIdForSupplier({ name: NEW_DEPOSIT_CONTACT_NAME });
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(transfer.currency);
            const bankAccountId = bankAccount.accountID;

            await this.exportTransferAsTransaction(transfer, contactId, bankAccountId);
        } catch (err) {
            this.handleExportError(err, DEFAULT_ACCOUNT_NAME, GENERIC_TRANSFER_EXPORT_ERROR_MESSAGE);
        }
    }

    async getOrganisation(): Promise<XeroEntities.IOrganisation> {
        const organisation = await this.xeroEntities.getOrganisation();
        return organisation;
    }

    async exportBankStatementForExpense(expenseId: string): Promise<void> {
        const logger = this.logger.child({ accountId: this.accountId, expenseId });

        const expense = await this.payhawkClient.getExpense(expenseId);
        const organisation = await this.getOrganisation();

        try {
            if (expense.transactions.length === 0) {
                await this.exportBankStatementForBill(expense, organisation, logger);
            } else {
                await this.exportBankStatementForTransactions(expense, organisation, logger);
            }
        } catch (err) {
            this.handleExportError(err, expense.category, GENERIC_BANK_STATEMENT_EXPORT_ERROR_MESSAGE);
        }
    }

    async exportBankStatementForTransfer(balanceId: string, transferId: string): Promise<void> {
        let logger = this.logger.child({ accountId: this.accountId, balanceId, transferId });

        const transfer = await this.payhawkClient.getTransfer(balanceId, transferId);
        if (!transfer) {
            throw logger.error(Error('Transfer not found'));
        }

        const organisation = await this.getOrganisation();
        this.validateExportDate(organisation, transfer.date, logger);

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
            logger.error(Error('Bank statement cannot be imported because the deposit is already reconciled'));
            return;
        }

        const statementId = await this.store.bankFeeds.getStatementByEntityId({
            account_id: this.accountId,
            xero_entity_id: bankTransaction.bankTransactionID,
            payhawk_entity_id: transferId,
            payhawk_entity_type: EntityType.Transfer,
        });

        if (statementId) {
            logger.info('Bank statement for this deposit is already exported');
            return;
        }

        const contactName = bankTransaction.contact.name;
        const description = bankTransaction.reference;

        let feedConnectionId = await this.store.bankFeeds.getConnectionIdByCurrency(this.accountId, currency);

        const bankAccount = await this.tryGetBankFeedAccount(currency, feedConnectionId, logger);

        if (!feedConnectionId) {
            feedConnectionId = await this.tryGetBankFeedConnection(bankAccount);
            await this.store.bankFeeds.createConnection(
                {
                    account_id: this.accountId,
                    bank_connection_id: feedConnectionId,
                    currency: bankAccount.currencyCode.toString(),
                },
            );
        }

        await this.tryCreateBankStatement(
            feedConnectionId,
            bankTransaction.bankTransactionID,
            bankAccount,
            date,
            -transfer.amount,
            transferId,
            EntityType.Transfer,
            contactName!,
            description,
            logger,
        );
    }

    async disconnectBankFeed() {
        let organisation: XeroEntities.IOrganisation;

        try {
            organisation = await this.getOrganisation();
        } catch (err) {
            if (err instanceof Xero.ForbiddenError || err instanceof Xero.UnauthorizedError) {
                this.logger.info(`Organisation is not authorized, skipping disconnect`);
                return;
            }

            throw err;
        }

        const logger = this.logger.child({ organisation });

        if (organisation.isDemoCompany) {
            logger.info(`Demo organisations are not authorized for bank feed, skipping bank feed disconnect`);
            return;
        }

        const connectionIds = await this.store.bankFeeds.getConnectionIdsForAccount(this.accountId);
        if (connectionIds.length === 0) {
            logger.info('Account has no active bank feed connections, skipping bank feed disconnect');
            return;
        }

        for (const connectionId of connectionIds) {
            const connectionLogger = logger.child({ connectionId });
            connectionLogger.info('Closing bank feed connection');

            try {
                await this.xeroEntities.bankFeeds.closeBankFeedConnection(connectionId);
            } catch (err) {
                throw connectionLogger.warn(err);
            } finally {
                await this.store.bankFeeds.deleteConnectionForAccount(this.accountId, connectionId);
            }

            connectionLogger.info('Bank feed connection closed');
        }
    }

    private async exportExpenseAsTransaction(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[], organisation: XeroEntities.IOrganisation) {
        // common data for all transactions linked to the expense
        const currency = expense.transactions[0].cardCurrency;
        const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
        const bankAccountId = bankAccount.accountID;
        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const bankTransactionIds = [];

        for (const t of expense.transactions) {
            const bankTransactionId = await this.exportTransaction(expense, t, bankAccountId, contactId, files, organisation);
            bankTransactionIds.push(bankTransactionId);
        }

        const transactionUrls = bankTransactionIds.map(id => XeroEntities.getTransactionExternalUrl(organisation.shortCode, id));
        await this.updateExpenseLinks(expense.id, transactionUrls);
    }

    private async exportTransaction(expense: Payhawk.IExpense, transaction: Payhawk.ITransaction, bankAccountId: string, contactId: string, files: Payhawk.IDownloadedFile[], organisation: XeroEntities.IOrganisation): Promise<string> {
        const amount = transaction.cardAmount;
        const { fx: fxFees, pos: posFees } = transaction.fees;
        const description = formatDescription(formatCardDescription(transaction.cardHolderName, transaction.cardLastDigits, transaction.cardName), expense.note);
        const date = getTransactionExportDate(transaction);

        this.validateExportDate(organisation, date, this.logger);

        const newAccountTransaction: XeroEntities.INewAccountTransaction = {
            date,
            bankAccountId,
            contactId,
            description,
            reference: transaction.description,
            amount,
            fxFees,
            posFees,
            accountCode: expense.reconciliation.accountCode,
            taxType: expense.taxRate ? expense.taxRate.code : undefined,
            files,
            url: this.buildTransactionUrl(transaction.id, new Date(date)),
        };

        const bankTransactionId = await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);

        await this.store.expenseTransactions.createIfNotExists(this.accountId, expense.id, transaction.id);

        return bankTransactionId;
    }

    private async exportTransferAsTransaction(transfer: Payhawk.IBalanceTransfer, contactId: string, bankAccountId: string): Promise<void> {
        const date = transfer.date;
        const newAccountTransaction: XeroEntities.INewAccountTransaction = {
            date,
            bankAccountId,
            contactId,
            reference: `Bank wire ${transfer.amount > 0 ? 'received' : 'sent'} on ${new Date(date).toUTCString()}`,
            amount: -transfer.amount,
            taxExempt: true,
            fxFees: 0,
            posFees: 0,
            files: [],
            url: this.buildTransferUrl(transfer.id, new Date(date)),
        };

        await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);
    }

    private async exportExpenseAsBill(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[], organisation: XeroEntities.IOrganisation) {
        const date = getBillExportDate(expense);

        this.validateExportDate(organisation, date, this.logger);

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
                this.logger.info('Expense is marked as paid, but no bank account was specified, no payment will be exported');
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

    private validateExportDate(organisation: XeroEntities.IOrganisation, date: string | Date, baseLogger: ILogger) {
        const lockDate = organisation.endOfYearLockDate;
        if (!lockDate) {
            return;
        }

        const logger = baseLogger.child({
            organisationName: organisation.name,
            expenseExportDate: date,
            organisationPeriodLockDate: lockDate,
        });

        if (isBeforeDate(date, lockDate)) {
            logger.info(LOCK_PERIOD_ERROR_MESSAGE);
            throw new ExportError(LOCK_PERIOD_ERROR_MESSAGE);
        }
    }

    private async deleteBillIfExists(expenseId: string, logger: ILogger): Promise<void> {
        const billUrl = this.buildExpenseUrl(expenseId);

        const billLogger = logger.child({ billUrl });

        billLogger.info('Deleting bill');
        await this.xeroEntities.deleteBill(billUrl);
        billLogger.info('Bill deleted');
    }

    private async deleteTransactions(expenseId: string, transactionIds: string[], logger: ILogger): Promise<void> {
        for (const transactionId of transactionIds) {
            await this.deleteTransaction(expenseId, transactionId, logger);
        }
    }

    private async deleteTransaction(expenseId: string, transactionId: string, logger: ILogger) {
        const transactionUrl = this.buildTransactionUrl(transactionId);
        const txLogger = logger.child({ transactionId, transactionUrl });

        txLogger.info('Deleting bank transaction');

        await this.xeroEntities.deleteAccountTransaction(transactionUrl);
        await this.store.expenseTransactions.delete(this.accountId, expenseId, transactionId);

        txLogger.info('Bank transaction deleted');
    }

    private async updateExpenseLinks(expenseId: string, urls: string[]) {
        return this.payhawkClient.updateExpense(
            expenseId,
            {
                externalLinks: urls.map(url => ({ url, title: 'Xero' })),
            },
        );
    }

    private async exportBankStatementForTransactions(expense: Payhawk.IExpense, organisation: XeroEntities.IOrganisation, baseLogger: ILogger): Promise<void> {
        const settledTransactions = expense.transactions.filter(t => t.settlementDate !== undefined) as Required<Payhawk.ITransaction>[];
        if (settledTransactions.length === 0) {
            baseLogger.info('Expense has no settled transactions, bank statement will not be exported');
            return;
        }

        const currency = settledTransactions[0].cardCurrency;

        const logger = baseLogger.child({ currency });

        let feedConnectionId = await this.store.bankFeeds.getConnectionIdByCurrency(this.accountId, currency);

        const bankAccount = await this.tryGetBankFeedAccount(currency, feedConnectionId, logger);

        if (!feedConnectionId) {
            feedConnectionId = await this.tryGetBankFeedConnection(bankAccount);
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
            this.validateExportDate(organisation, date, baseLogger);

            const totalAmount = getTransactionTotalAmount(transaction);
            const transactionUrl = this.buildTransactionUrl(transaction.id, new Date(date));

            const txLogger = logger.child({ transactionId: transaction.id, transactionUrl });
            const bankTransaction = await this.xeroEntities.getBankTransactionByUrl(transactionUrl);
            if (!bankTransaction) {
                txLogger.error(Error('Bank transaction not found by URL, bank statement will not be exported'));
                continue;
            }

            const statementId = await this.store.bankFeeds.getStatementByEntityId({
                account_id: this.accountId,
                xero_entity_id: bankTransaction.bankTransactionID,
                payhawk_entity_id: transaction.id,
                payhawk_entity_type: EntityType.Transaction,
            });

            if (statementId) {
                logger.info('Bank statement for this expense transaction is already exported');
                return;
            }

            if (bankTransaction.isReconciled) {
                logger.info(EXPENSE_RECONCILED_ERROR_MESSAGE);
                throw new ExportError(EXPENSE_RECONCILED_ERROR_MESSAGE);
            }

            const contactName = bankTransaction.contact.name;
            const description = bankTransaction.reference;

            await this.tryCreateBankStatement(
                feedConnectionId,
                bankTransaction.bankTransactionID,
                bankAccount,
                date,
                totalAmount,
                transaction.id,
                EntityType.Transaction,
                contactName!,
                description,
                logger,
            );
        }
    }

    private async tryGetBankFeedConnection(bankAccount: Xero.IBankAccount): Promise<string> {
        try {
            const connectionId = await this.xeroEntities.bankFeeds.getConnectionIdForBankAccount(bankAccount);
            return connectionId;
        } catch (err) {
            if (!(err instanceof Xero.HttpError)) {
                throw err;
            }

            const error = err.responseData as IFeedConnectionError | undefined;
            if (!error) {
                throw err;
            }

            switch (error.type) {
                case BankFeedConnectionErrorType.InvalidOrganisationBankFeeds:
                    throw new ExportError('Failed to export bank statement into Xero. The organisation you are using does not support bank feeds.');
                case BankFeedConnectionErrorType.InvalidOrganisationMultiCurrency:
                    throw new ExportError('Failed to export bank statement into Xero. The organisation you are using does not support multi-currency.');
                case BankFeedConnectionErrorType.InternalError:
                    throw new ExportError('Failed to export bank statement into Xero due to an internal Xero error. Please try again in a few minutes');
                default:
                    throw error;
            }
        }
    }

    private async tryGetBankFeedAccount(currency: string, feedConnectionId: string | undefined, logger: ILogger): Promise<XeroEntities.BankAccounts.IBankAccount> {
        try {
            return await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
        } catch (err) {
            if (err.message === `${currency} bank account is archived and cannot be used`) {
                if (feedConnectionId) {
                    await this.store.bankFeeds.deleteConnectionForAccount(this.accountId, feedConnectionId);
                    logger.info('Bank account cannot be used, existing feed connection deleted');
                }
            }

            throw err;
        }
    }

    private async tryCreateBankStatement(feedConnectionId: string, bankTransactionId: string, bankAccount: Xero.IBankAccount, date: string, totalAmount: number, entityId: string, entityType: EntityType, contactName: string, description: string, logger: ILogger): Promise<void> {
        let statementId: string;

        try {
            statementId = await this.xeroEntities.bankFeeds.createBankStatement(
                feedConnectionId,
                bankTransactionId,
                date,
                totalAmount,
                contactName!,
                description,
            );
        } catch (err) {
            if (!(err instanceof Xero.HttpError)) {
                throw err;
            }

            const items = err.responseData.items as IRejectedBankStatement[] | undefined;
            const rejectedItem = items ? items[0] : undefined;
            if (!rejectedItem) {
                throw err;
            }

            const error = rejectedItem.errors[0];
            if (!error) {
                throw err;
            }

            switch (error.type) {
                case BankStatementErrorType.InvalidFeedConnection:
                    logger.info('Bank feed connection id is invalid. Retrying to export statement');

                    await this.store.bankFeeds.deleteConnectionForAccount(this.accountId, feedConnectionId);

                    const newFeedConnectionId = await this.tryGetBankFeedConnection(bankAccount);
                    await this.store.bankFeeds.createConnection(
                        {
                            account_id: this.accountId,
                            bank_connection_id: feedConnectionId,
                            currency: bankAccount.currencyCode.toString(),
                        },
                    );

                    statementId = await this.xeroEntities.bankFeeds.createBankStatement(
                        newFeedConnectionId,
                        bankTransactionId,
                        date,
                        totalAmount,
                        contactName!,
                        description,
                    );
                    break;
                case BankStatementErrorType.InvalidStartDate:
                    throw new ExportError('Failed to export bank statement into Xero. The expense date must be no earlier than 1 year from today\'s date.');
                case BankStatementErrorType.InvalidEndDate:
                    throw new ExportError('Failed to export bank statement into Xero. The expense date must be not be in the future.');
                case BankStatementErrorType.InternalError:
                    throw new ExportError('Failed to export bank statement into Xero due to an internal Xero error. Please try again in a few minutes');
                default:
                    throw error;
            }
        }

        await this.store.bankFeeds.createStatement({
            account_id: this.accountId,
            xero_entity_id: bankTransactionId,
            payhawk_entity_id: entityId,
            payhawk_entity_type: entityType,
            bank_statement_id: statementId,
        });
    }

    private async exportBankStatementForBill(expense: Payhawk.IExpense, organisation: XeroEntities.IOrganisation, baseLogger: ILogger): Promise<void> {
        const expenseCurrency = expense.reconciliation.expenseCurrency;
        const expenseAmount = expense.reconciliation.expenseTotalAmount;

        const date = getBillExportDate(expense);
        this.validateExportDate(organisation, date, baseLogger);

        const billUrl = this.buildExpenseUrl(expense.id, new Date(date));

        const logger = baseLogger.child({
            currency: expenseCurrency,
            totalAmount: expenseAmount,
            billUrl,
        });

        if (!expenseCurrency) {
            logger.info('Expense has no currency, bank statement for bill will not be exported');
            return;
        }

        if (expenseAmount === 0) {
            logger.info('Expense amount is 0, bank statement for bill will not be exported');
            return;
        }

        const bill = await this.xeroEntities.getBillByUrl(billUrl);
        if (!bill) {
            logger.error(Error('Bill not found, bank statement will not be exported'));
            return;
        }

        if (bill.status !== Xero.InvoiceStatus.PAID) {
            logger.info('Bill must have status PAID, bank statement will not be exported');
            return;
        }

        if (!bill.payments || bill.payments.length === 0) {
            logger.error(Error('Bill does not have any payments associated with it, bank statement will not be exported'));
            return;
        }

        const billId = bill.invoiceID;

        const statementId = await this.store.bankFeeds.getStatementByEntityId({
            account_id: this.accountId,
            xero_entity_id: billId,
            payhawk_entity_id: expense.id,
            payhawk_entity_type: EntityType.Expense,
        });

        if (statementId) {
            logger.info('Bank statement for this expense is already exported');
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

            const bankAccountCurrency = await this.xeroEntities.bankAccounts.getCurrencyByBankAccountCode(fullPayment.account.code);
            if (!bankAccountCurrency) {
                throw Error('Couldn\'t find payment bank account');
            }

            currency = bankAccountCurrency;

            amount = convertAmount(payment.amount, payment.currencyRate);
        }

        const contactName = bill.contact.name!;

        const paymentDate = payment.date;
        const description = `Payment: ${contactName}`;

        let feedConnectionId = await this.store.bankFeeds.getConnectionIdByCurrency(this.accountId, currency);

        const bankAccount = await this.tryGetBankFeedAccount(currency, feedConnectionId, logger);

        if (!feedConnectionId) {
            feedConnectionId = await this.tryGetBankFeedConnection(bankAccount);
            await this.store.bankFeeds.createConnection(
                {
                    account_id: this.accountId,
                    bank_connection_id: feedConnectionId,
                    currency: bankAccount.currencyCode.toString(),
                },
            );
        }

        await this.tryCreateBankStatement(
            feedConnectionId,
            billId,
            bankAccount,
            paymentDate,
            amount,
            expense.id,
            EntityType.Expense,
            contactName!,
            description,
            logger,
        );
    }

    private handleExportError(err: Error, category: string | undefined, genericErrorMessage: string) {
        this.handleExportErrorCommon(err);

        const errorMessage = err.message;
        const categoryName = category || DEFAULT_ACCOUNT_NAME;
        if (ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX.test(errorMessage)) {
            throw new ExportError(`The Xero account code for category "${categoryName}" is archived or deleted. Please sync your chart of accounts.`);
        } else if (INVALID_ACCOUNT_CODE_MESSAGE_REGEX.test(errorMessage)) {
            throw new ExportError(`The Xero account code for category "${categoryName}" cannot be used. Please use a different one.`);
        } else if (ARCHIVED_BANK_ACCOUNT_MESSAGE_REGEX.test(errorMessage)) {
            throw new ExportError(`${errorMessage}. Please activate it.`);
        } else if (errorMessage === LOCK_PERIOD_ERROR_MESSAGE) {
            throw new ExportError(LOCK_PERIOD_ERROR_MESSAGE);
        } else if (errorMessage === EXPENSE_RECONCILED_ERROR_MESSAGE) {
            throw new ExportError(EXPENSE_RECONCILED_ERROR_MESSAGE);
        } else if (errorMessage === DEFAULT_GENERAL_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE) {
            throw new ExportError(`The default account code 'Payhawk General' has been archived or deleted in Xero. Please activate it or use a different account code.`);
        } else if (errorMessage === DEFAULT_FEES_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE) {
            throw new ExportError(`The default account code 'Fees' has been archived or deleted in Xero. Please activate it or use a different account code.`);
        }

        // unhandled, we need to log it
        this.logger.error(err);

        throw new ExportError(genericErrorMessage);
    }

    private handleExportErrorCommon(err: Error) {
        if (err instanceof ExportError) {
            throw err;
        }

        if (
            err instanceof Xero.HttpError && (
                err.code === Xero.HttpStatusCodes.InternalError ||
                err.code === Xero.HttpStatusCodes.Timeout
            )) {
            throw new ExportError('Failed to export into Xero due to an internal Xero API error. Please try again in a minute.');
        }
    }

    private handleExpenseDeleteError(err: Error) {
        this.handleExportErrorCommon(err);

        this.logger.error(err);

        throw new ExportError('Failed to delete expense from Xero');
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

export function getTransactionTotalAmount(t: Payhawk.ITransaction): number {
    return myriadthsToNumber((
        BigInt(numberToMyriadths(t.cardAmount)) +
        BigInt(numberToMyriadths(t.fees.fx)) +
        BigInt(numberToMyriadths(t.fees.pos)))
        .toString()
    );
}

export function convertAmount(amount: number, currencyRate: number): number {
    return Number(Decimal.div(amount, currencyRate).toFixed(2));
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

const NEW_DEPOSIT_CONTACT_NAME = 'New Deposit';

const TIME_AT_PARAM_CHANGE = Date.UTC(2020, 0, 29, 0, 0, 0, 0);

const GENERIC_EXPENSE_EXPORT_ERROR_MESSAGE = 'Failed to export expense into Xero. Please check that all expense data is correct and try again.';
const GENERIC_TRANSFER_EXPORT_ERROR_MESSAGE = 'Failed to export deposit into Xero. Please check that all deposit data is correct and try again.';
const GENERIC_BANK_STATEMENT_EXPORT_ERROR_MESSAGE = 'Failed to export expense into Xero. There is an error with your bank feed connection. Make sure you are not using a demo organization in Xero.';
