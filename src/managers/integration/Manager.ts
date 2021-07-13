import { Payhawk, Xero } from '@services';
import { BankFeedConnectionErrorType, BankStatementErrorType, DEFAULT_ACCOUNT_NAME, EntityType, FEES_ACCOUNT_NAME, IFeedConnectionError, IRejectedBankStatement, Optional } from '@shared';
import { ISchemaStore } from '@stores';
import { ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX, ARCHIVED_BANK_ACCOUNT_MESSAGE_REGEX, DEFAULT_FEES_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE, DEFAULT_GENERAL_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE, EXPENSE_RECONCILED_ERROR_MESSAGE, ExportError, ILogger, INVALID_ACCOUNT_CODE_MESSAGE_REGEX, isBeforeDate, LOCK_PERIOD_ERROR_MESSAGE, myriadthsToNumber, numberToMyriadths, sum, TRACKING_CATEGORIES_MISMATCH_ERROR_MESSAGE } from '@utils';

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
            this.logger.error(Error('Failed to initialize account. Sync tax rates failed'), { err });

            result.data!.errors!.taxRates = 'Sync tax rates failed';
        }

        try {
            this.logger.info(`Sync chart of accounts started`);
            result.data!.accountCodesCount = await this.synchronizeChartOfAccounts();
            this.logger.info(`Completed`);
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Sync chart of accounts failed'), { err });

            result.data!.errors!.accountCodes = 'Sync chart of accounts failed';
        }

        try {
            this.logger.info(`Sync bank accounts started`);
            const currencies = await this.synchronizeBankAccounts();
            this.logger.info(`Completed`);

            result.data!.bankAccounts = currencies;
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Sync bank accounts failed'), { err });

            result.data!.errors!.bankAccounts = 'Sync bank accounts failed';
        }

        try {
            this.logger.info(`Creating default expense accounts`);
            await this.xeroEntities.ensureDefaultExpenseAccountsExist();
            this.logger.info(`Completed`);

            result.data!.expenseAccounts = [DEFAULT_ACCOUNT_NAME, FEES_ACCOUNT_NAME];
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. Create default expense accounts failed'), { err });

            result.data!.errors!.expenseAccounts = 'Creating default expense accounts failed';
        }

        try {
            this.logger.info(`Sync tracking categories started`);
            result.data!.customFieldsCount = await this.synchronizeTrackingCategories();
            this.logger.info(`Completed`);
        } catch (err) {
            isSuccessful = false;
            this.logger.error(Error('Failed to initialize account. `Sync tracking categories failed'), { err });
            result.data!.errors!.customFields = 'Sync tracking categories failed';
        }

        if (isSuccessful && !account.initial_sync_completed) {
            await this.store.accounts.update(this.accountId, true);
        }

        return result;
    }

    async synchronizeTrackingCategories(): Promise<number> {
        const xeroTrackingCategories = await this.xeroEntities.getTrackingCategories();
        const customFields = xeroTrackingCategories.map<Payhawk.ICustomField>(category => ({
            externalId: category.trackingCategoryId,
            label: category.name,
            values: category.options.map<Payhawk.ICustomFieldValue>(option => ({ label: option.name, externalId: option.trackingOptionId })),
        }));

        await this.payhawkClient.synchronizeExternalCustomFields(customFields);

        return xeroTrackingCategories.length;
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
        const payhawkBankAccountIds: Set<string> = new Set();
        for (const currency of uniqueCurrencies) {
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(currency);
            payhawkBankAccountIds.add(bankAccount.accountID);
        }

        // then pull
        const bankAccounts = await this.xeroEntities.bankAccounts.get();
        const bankAccountModels = bankAccounts
            .filter(b => !payhawkBankAccountIds.has(b.accountID))
            .map(b => ({
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
        if (expense.isLocked) {
            this.logger.info('Expense will not be exported because it is locked');
            return;
        }

        const files = await this.payhawkClient.downloadFiles(expense);

        const organisation = await this.getOrganisation();

        try {
            await this._exportExpense(expense, files, organisation);
        } catch (err) {
            this.handleExportError(err, expense.category, GENERIC_EXPENSE_EXPORT_ERROR_MESSAGE);
        } finally {
            await Promise.all(files.map(async (f: Payhawk.IDownloadedFile) => this.deleteFile(f.path)));
        }
    }

    async deleteExpense(expenseId: string): Promise<void> {
        const logger = this.logger.child({ expenseId });

        try {
            await this.deleteBillIfExists(expenseId, logger);
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

        const contactId = await this.xeroEntities.getContactForRecipient({ name: NEW_DEPOSIT_CONTACT_NAME });

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
                this.handleExportError(err, DEFAULT_ACCOUNT_NAME, GENERIC_TRANSFER_EXPORT_ERROR_MESSAGE);
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

            const contactId = await this.xeroEntities.getContactForRecipient({ name: NEW_DEPOSIT_CONTACT_NAME });
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
        if (expense.isLocked) {
            logger.info('Expense is locked, bank statement will not be exported');
            return;
        }

        const organisation = await this.getOrganisation();

        try {
            await this._exportBankStatementForExpense(expense, organisation, logger);
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

    private extractTrackingCategories(
        customFields: Optional<Payhawk.ICustomFields>,
        logger: ILogger,
    ): Optional<Xero.ITrackingCategoryValue[]> {
        if (!customFields) {
            return undefined;
        }

        const xeroCustomFieldsWithEntries = Object.entries(customFields)
            .filter(([_, value]) => value.externalSource === 'xero' && value.selectedValues && Object.keys(value.selectedValues));

        xeroCustomFieldsWithEntries.forEach(([key, value]) => {
            const fieldLogger = logger.child({ customFieldId: key });
            if (!value.externalId) {
                throw fieldLogger.error(new Error('Missing external id'));
            }
            if (!value.selectedValues) {
                throw fieldLogger.error(new Error('Missing selectedValues'));
            }
            const valueIds = Object.keys(value.selectedValues);
            if (valueIds.length !== 1) {
                throw fieldLogger.error(new Error(`Multiple selectedValues. We don't support nested custom fields`));
            }
            const firstValue = valueIds[0];
            if (!value.selectedValues[firstValue].externalId) {
                throw fieldLogger.error(new Error(`Missing value external id'`));
            }
        });

        return xeroCustomFieldsWithEntries
            .map<Xero.ITrackingCategoryValue>(([_, value]) => ({
                categoryId: value.externalId!,
                valueId: value.selectedValues![Object.keys(value.selectedValues!)[0]].externalId!,
            }));
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

    private async _exportExpense(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[], organisation: XeroEntities.IOrganisation) {
        const date = getExportDate(expense);

        this.validateExportDate(organisation, date, this.logger);

        let expenseCurrency = expense.reconciliation.expenseCurrency;
        if (!expenseCurrency) {
            throw new ExportError('Failed to export into Xero. Expense has no currency.');
        }

        const hasTransactions = expense.transactions.length > 0;
        const isCredit = hasTransactions && expense.transactions.every(t => t.cardAmount < 0);

        let totalAmount = expense.reconciliation.expenseTotalAmount;
        let accountCode = expense.reconciliation.accountCode;

        let contactId: string;
        if (expense.recipient) {
            contactId = await this.xeroEntities.getContactForRecipient(expense.recipient);
        } else {
            contactId = await this.xeroEntities.getContactForRecipient({ name: expense.supplier.name, vat: expense.supplier.vat });
        }

        let itemUrl: string;
        const payments: XeroEntities.IPayment[] = [];
        const description = formatDescription(expense.ownerName, expense.note);

        const logger = this.logger.child({ expenseId: expense.id });

        if (hasTransactions) {
            const transactionCurrencies = Array.from(new Set(expense.transactions.map(tx => tx.cardCurrency)));
            if (transactionCurrencies.length > 1) {
                throw new ExportError('Failed to export into Xero. Expense transactions are not of same currency');
            }

            expenseCurrency = transactionCurrencies[0];
            totalAmount = Math.abs(sum(...expense.transactions.map(t => t.cardAmount)));

            const areAllTransactionsSettled = expense.transactions.every(tx => tx.settlementDate !== undefined);
            if (!expense.isReadyForReconciliation) {
                this.logger.info('Expense is not ready to be reconciled, payments will not be exported and bill will use default expense account');
                accountCode = undefined; // use default account code for unsettled transactions
            } else {
                if (!areAllTransactionsSettled) {
                    this.logger.info('Expense transactions are not settled, payments will not be exported');
                } else {
                    const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(expenseCurrency);

                    for (const expenseTransaction of expense.transactions) {
                        if (!expenseTransaction.settlementDate) {
                            throw new ExportError('Failed to export into Xero. Expense transaction is not settled');
                        }

                        payments.push({
                            bankAccountId: bankAccount.accountID,
                            amount: expenseTransaction.cardAmount,
                            currency: expenseTransaction.cardCurrency,
                            date: expenseTransaction.settlementDate,
                            fxFees: expenseTransaction.fees.fx,
                            posFees: expenseTransaction.fees.pos,
                        });
                    }
                }
            }
        }

        const totalFees = sum(
            ...payments.map(d => d.fxFees || 0),
            ...payments.map(d => d.posFees || 0),
            ...payments.map(d => d.bankFees || 0),
        );

        if (isCredit) {
            totalAmount = totalAmount - totalFees;
        }

        const lineItems: XeroEntities.ILineItem[] = this.extractLineItems(expense, totalAmount, accountCode, logger);

        if (isCredit) {
            const newCreditNote: XeroEntities.INewCreditNote = {
                payments,
                totalAmount,
                currency: expenseCurrency,
                contactId,
                description,
                date,
                accountCode,
                taxType: expense.taxRate?.code,
                creditNoteNumber: expense.document?.number || XeroEntities.getExpenseNumber(expense.id),
                files,
                lineItems,
            };

            const creditNoteId = await this.xeroEntities.createOrUpdateCreditNote(newCreditNote);
            itemUrl = XeroEntities.getCreditNoteExternalUrl(organisation.shortCode, creditNoteId);
        } else {
            const billUrl = this.buildExpenseUrl(expense.id, new Date(date));
            if (expense.isPaid) {
                if (expense.paymentData.sourceType === Payhawk.PaymentSourceType.Balance &&
                    expense.paymentData.source &&
                    expense.balancePayments.length > 0
                ) {
                    const bill = await this.xeroEntities.getBillByUrl(billUrl);
                    const balancePayment = await this.processBalancePayments(expense, bill);
                    if (balancePayment) {
                        payments.push(balancePayment);
                    }
                }
            }

            const newBill: XeroEntities.INewBill = {
                payments,
                date,
                dueDate: expense.paymentData.dueDate || date,
                isPaid: expense.isPaid,
                contactId,
                description,
                reference: expense.document?.number,
                currency: expenseCurrency,
                totalAmount,
                accountCode,
                taxType: expense.taxRate ? expense.taxRate.code : undefined,
                files,
                url: billUrl,
                lineItems,
            };

            const billId = await this.xeroEntities.createOrUpdateBill(newBill);
            itemUrl = XeroEntities.getBillExternalUrl(organisation.shortCode, billId);
        }

        await this.updateExpenseLinks(expense.id, [itemUrl]);
    }

    private extractLineItems(expense: Payhawk.IExpense, totalAmount: number, accountCode: string | undefined, logger: ILogger) {
        const lineItemsSum = expense.lineItems && expense.lineItems.length > 0 ? sum(...expense.lineItems.map(x => x.reconciliation.expenseTotalAmount)) : 0;
        if (lineItemsSum > 0 && lineItemsSum !== totalAmount) {
            throw new ExportError('Failed to export expense. Sum of line items amount does not match expense total amount');
        }

        const lineItems: XeroEntities.ILineItem[] = [];

        if (!expense.lineItems || expense.lineItems.length === 0) {
            const trackingCategories = this.extractTrackingCategories(expense.reconciliation.customFields2, logger);
            const lineItem: XeroEntities.ILineItem = {
                amount: totalAmount,
                accountCode,
                taxType: expense.taxRate?.code,
                trackingCategories,
            };

            lineItems.push(lineItem);
        } else {
            for (const item of expense.lineItems) {
                const lineItem: XeroEntities.ILineItem = {
                    amount: item.reconciliation.expenseTotalAmount,
                    accountCode: expense.isReadyForReconciliation ? item.reconciliation.accountCode : undefined,
                    taxType: item.taxRate?.code,
                    trackingCategories: this.extractTrackingCategories(item.reconciliation.customFields2, logger),
                };

                lineItems.push(lineItem);
            }
        }

        return lineItems;
    }

    private async processBalancePayments(expense: Payhawk.IExpense, bill: Xero.IInvoice | undefined) {
        let paymentData: XeroEntities.IPayment | undefined;

        const failedPayments = expense.balancePayments.filter(p => p.status === Payhawk.BalancePaymentStatus.Rejected);
        const settledPayments = expense.balancePayments.filter(p => p.status === Payhawk.BalancePaymentStatus.Settled);
        if (settledPayments.length > 1) {
            throw Error('Expense has multiple settled payments');
        }

        const settledPayment = settledPayments[0];
        const billPayment = bill && bill.payments ? bill.payments[0] : undefined;

        const hasOnlyFailedPayments = failedPayments.length > 0 && expense.balancePayments.length === failedPayments.length;
        const fullPayment = billPayment ? await this.xeroEntities.getBillPayment(billPayment.paymentID) : undefined;
        if (bill && fullPayment && hasOnlyFailedPayments) {
            await this.revertFailedPayment(expense, bill, fullPayment);
        }

        if (settledPayment) {
            const bankAccount = await this.xeroEntities.bankAccounts.getOrCreateByCurrency(settledPayment.currency);
            if (bankAccount) {
                if (settledPayment.amount !== expense.reconciliation.expenseTotalAmount) {
                    throw new ExportError('Payment total amount does not match expense total amount');
                }

                paymentData = {
                    bankAccountId: bankAccount.accountID,
                    currency: settledPayment.currency,
                    amount: settledPayment.amount,
                    bankFees: settledPayment.fees,
                    date: settledPayment.date,
                };
            }
        }

        return paymentData;
    }

    private async revertFailedPayment(expense: Payhawk.IExpense, bill: Xero.IInvoice, billPayment: Xero.IPayment) {
        const paymentId = billPayment.paymentID;
        const bankStatementId = await this.store.bankFeeds.getStatementByEntityId({
            account_id: this.accountId,
            payhawk_entity_id: expense.id,
            payhawk_entity_type: EntityType.Expense,
            xero_entity_id: paymentId,
        });

        if (bankStatementId) {
            // create a rejected statement line item
            await this.xeroEntities.bankFeeds.revertBankStatement(
                bankStatementId,
                `rejected:${paymentId}`,
                billPayment.date,
                bill.contact.name!,
                `Rejected payment on ${billPayment.date}: ${bill.reference}`,
            );

            // create 2 transactions to match each statement line item related to the payment reversal
            // we assign these transactions to Payhawk General
            const [generalExpenseAccount, feesExpenseAccount] = await this.xeroEntities.ensureDefaultExpenseAccountsExist();

            const newAccountTransaction: XeroEntities.INewAccountTransaction = {
                date: billPayment.date,
                bankAccountId: billPayment.account!.accountID,
                contactId: bill.contact.contactID!,
                description: billPayment.reference,
                reference: billPayment.reference,
                amount: billPayment.amount,
                fxFees: 0,
                posFees: 0,
                accountCode: generalExpenseAccount.code,
                taxType: feesExpenseAccount.taxType,
                files: [],
                url: this.buildTransactionUrl(paymentId, new Date(billPayment.date)),
                trackingCategories: [],
            };

            await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);
            await this.xeroEntities.createOrUpdateAccountTransaction({
                ...newAccountTransaction,
                amount: -newAccountTransaction.amount,
                url: `${newAccountTransaction.url}&rejected=true`,
            });
        }

        await this.xeroEntities.deletePayment(paymentId);
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

        await this.xeroEntities.deleteBill(billUrl);
    }

    private async updateExpenseLinks(expenseId: string, urls: string[]) {
        return this.payhawkClient.updateExpense(
            expenseId,
            {
                externalLinks: urls.map(url => ({ url, title: 'Xero' })),
            },
        );
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
                case BankStatementErrorType.DuplicateStatement:
                    logger.info('The statement has already been exported');
                    return;
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

    private async _exportBankStatementForExpense(expense: Payhawk.IExpense, organisation: XeroEntities.IOrganisation, baseLogger: ILogger): Promise<void> {
        const hasTransactions = expense.transactions.length > 0;
        const isCredit = hasTransactions && expense.transactions.every(t => t.cardAmount < 0);
        const isPaidWithBalancePayment = expense.isPaid && expense.paymentData.sourceType === Payhawk.PaymentSourceType.Balance;
        if (!hasTransactions && !isPaidWithBalancePayment) {
            this.logger.info(`Expense has no transactions and is not paid with balance payment, bank statement will not be exported`);
            return;
        }

        if (hasTransactions) {
            const transactionCurrencies = Array.from(new Set(expense.transactions.map(tx => tx.cardCurrency)));
            if (transactionCurrencies.length > 1) {
                throw new ExportError('Failed to export into Xero. Expense transactions are not of same currency');
            }

            const areAllTransactionsSettled = !expense.transactions.some(tx => tx.settlementDate === undefined);
            if (!areAllTransactionsSettled) {
                this.logger.info('Not all transactions are settled, bank statement lines for expense payments will not be exported');
                return;
            }
        }

        const currency = hasTransactions ? expense.transactions[0].cardCurrency : isPaidWithBalancePayment ? expense.balancePayments[0].currency : expense.reconciliation.expenseCurrency;
        if (!currency) {
            throw new ExportError('Failed to export bank statement. Expense has no currency');
        }

        let logger;
        let contactName: string | undefined;
        let reference;

        const date = getExportDate(expense);
        if (isCredit) {
            const creditNoteNumber = expense.document?.number || XeroEntities.getExpenseNumber(expense.id);

            logger = baseLogger.child({
                creditNoteNumber,
            });

            const creditNote = await this.xeroEntities.getCreditNoteByNumber(creditNoteNumber);
            if (!creditNote) {
                logger.info(Error('Credit note not found, bank statement will not be exported'));
                return;
            }

            contactName = creditNote.contact?.name;
            reference = creditNote.reference || creditNoteNumber;
        } else {
            const billUrl = this.buildExpenseUrl(expense.id, new Date(date));

            logger = baseLogger.child({
                billUrl,
            });

            this.validateExportDate(organisation, date, logger);

            const bill = await this.xeroEntities.getBillByUrl(billUrl);
            if (!bill) {
                logger.info(Error('Bill not found, bank statement will not be exported'));
                return;
            }

            contactName = bill.contact.name;
            reference = bill.reference;
        }

        contactName = contactName || expense.supplier.name;

        // backwards compatibility for no statement duplication
        const statementExists = await this.store.bankFeeds.existsStatement({
            account_id: this.accountId,
            payhawk_entity_id: expense.id,
            payhawk_entity_type: EntityType.Expense,
        });

        if (statementExists) {
            logger.info('Bank statement for this expense is already exported');
            return;
        }

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

        if (hasTransactions) {
            for (const transaction of expense.transactions) {
                const statementTransactionId = `transaction-${transaction.id}`;
                const statementId = await this.store.bankFeeds.getStatementByEntityId({
                    account_id: this.accountId,
                    xero_entity_id: statementTransactionId,
                    payhawk_entity_id: transaction.id,
                    payhawk_entity_type: EntityType.Transaction,
                });

                if (statementId) {
                    logger.info('Bank statement for this expense transaction is already exported');
                    continue;
                }

                const amount = sum(transaction.cardAmount, transaction.fees.fx, transaction.fees.pos);
                const paymentDate = transaction.date;
                const description = `${amount > 0 ? 'Payment to' : 'Refund from'} ${contactName}: ${reference}`;

                await this.tryCreateBankStatement(
                    feedConnectionId,
                    statementTransactionId,
                    bankAccount,
                    paymentDate,
                    amount,
                    transaction.id,
                    EntityType.Transaction,
                    contactName,
                    description,
                    logger,
                );
            }
        } else if (isPaidWithBalancePayment) {
            const settledPayments = expense.balancePayments.filter(p => p.status === Payhawk.BalancePaymentStatus.Settled);
            if (settledPayments.length > 1) {
                throw Error('Expense has multiple settled payments');
            }

            const balancePayment = settledPayments[0];
            if (!balancePayment) {
                throw new ExportError('Failed to export bank statement into Xero. Expense has no settled payment');
            }

            const statementTransactionId = `balance-payment-${balancePayment.id}`;
            const statementId = await this.store.bankFeeds.getStatementByEntityId({
                account_id: this.accountId,
                xero_entity_id: statementTransactionId,
                payhawk_entity_id: balancePayment.id,
                payhawk_entity_type: EntityType.BalancePayment,
            });

            if (statementId) {
                logger.info('Bank statement for this expense balance payment is already exported');
                return;
            }

            const amount = sum(balancePayment.amount, balancePayment.fees);
            const paymentDate = balancePayment.date;
            const description = `Payment to ${contactName}: ${reference}`;

            await this.tryCreateBankStatement(
                feedConnectionId,
                statementTransactionId,
                bankAccount,
                paymentDate,
                amount,
                balancePayment.id,
                EntityType.BalancePayment,
                contactName,
                description,
                logger,
            );
        } else {
            logger.info('Expense is not paid with card or via bank transfer, bank statement will not be exported');
            return;
        }
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
        } else if (errorMessage === TRACKING_CATEGORIES_MISMATCH_ERROR_MESSAGE) {
            throw new ExportError('A tracking category was not found in Xero. Please sync your tracking categories and update your expense.');
        }

        // at this point we would like to have insights on what actually happened, generic message isn't enough for debugging purposes
        this.logger.info(`Export failed with an unexpected ${['err', err]}`);

        throw new ExportError(genericErrorMessage, err);
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

        throw new ExportError('Failed to delete expense from Xero', err);
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

function getExportDate(expense: Payhawk.IExpense): string {
    return expense.document !== undefined && expense.document.date !== undefined ? expense.document.date : expense.createdAt;
}

const NEW_DEPOSIT_CONTACT_NAME = 'New Deposit';

const TIME_AT_PARAM_CHANGE = Date.UTC(2020, 0, 29, 0, 0, 0, 0);

const GENERIC_EXPENSE_EXPORT_ERROR_MESSAGE = 'Failed to export expense into Xero. Please check that all expense data is correct and try again.';
const GENERIC_TRANSFER_EXPORT_ERROR_MESSAGE = 'Failed to export deposit into Xero. Please check that all deposit data is correct and try again.';
const GENERIC_BANK_STATEMENT_EXPORT_ERROR_MESSAGE = 'Failed to export expense into Xero. There is an error with your bank feed connection. Make sure you are not using a demo organization in Xero.';
