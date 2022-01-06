import { Payhawk, Xero } from '@services';
import { AccountStatus, DEFAULT_ACCOUNT_CODE, DEFAULT_ACCOUNT_NAME, FEES_ACCOUNT_CODE, FEES_ACCOUNT_NAME, ITaxRate, ITrackingCategory, TaxType } from '@shared';
import { ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX, DOCUMENT_DATE_IN_LOCKED_PERIOD_MESSAGE, ExportError, fromDateTicks, ILogger, INVALID_ACCOUNT_CODE_MESSAGE_REGEX, sumAmounts, TAX_TYPE_IS_MANDATORY_MESSAGE } from '@utils';

import { create as createBankAccountsManager, IManager as IBankAccountsManager } from './bank-accounts';
import { create as createBankFeedsManager, IManager as IBankFeedsManager } from './bank-feeds';
import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { INewCreditNote as INewCreditNoteEntity } from './INewCreditNote';
import { IOrganisation } from './IOrganisation';

export class Manager implements IManager {
    bankAccounts: IBankAccountsManager;
    bankFeeds: IBankFeedsManager;

    constructor(private readonly xeroClient: Xero.IClient, private readonly logger: ILogger) {
        this.bankAccounts = createBankAccountsManager(this.xeroClient);
        this.bankFeeds = createBankFeedsManager(this.xeroClient, this.logger);
    }

    async getOrganisation(): Promise<IOrganisation> {
        const organisation = await this.xeroClient.accounting.getOrganisation();
        return {
            name: organisation.name,
            baseCurrency: organisation.baseCurrency,
            shortCode: organisation.shortCode,
            isDemoCompany: organisation.isDemoCompany,
            periodLockDate: fromDateTicks(organisation.periodLockDate),
            endOfYearLockDate: fromDateTicks(organisation.endOfYearLockDate),
        };
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        return await this.xeroClient.accounting.getExpenseAccounts({
            status: AccountStatus.Active,
        });
    }

    async getTaxRates(): Promise<ITaxRate[]> {
        return this.xeroClient.accounting.getTaxRates();
    }

    async getTrackingCategories(): Promise<ITrackingCategory[]> {
        return this.xeroClient.accounting.getTrackingCategories();
    }

    async getContactForRecipient(recipient: Payhawk.IRecipient): Promise<string> {
        const hasRecipient = recipient.name !== undefined && recipient.name.length > 0;
        const contactName = hasRecipient ? recipient.name : DEFAULT_SUPPLIER_NAME;
        const contact = await this.xeroClient.getOrCreateContact(
            contactName,
            hasRecipient ? recipient.vat : undefined,
            recipient.email,
        );

        return contact.contactID!;
    }

    async createOrUpdateAccountTransaction(newTransaction: INewAccountTransaction): Promise<string> {
        const logger = this.logger.child({ bankAccountTransaction: newTransaction });

        const transaction = await this.xeroClient.getTransactionByUrl(newTransaction.url);
        if (transaction && transaction.isReconciled) {
            logger.info('Bank account transaction already exists and is reconciled, skipping update');
            return transaction.bankTransactionID;
        }

        const [generalExpenseAccount, feesExpenseAccount] = await this.ensureDefaultExpenseAccountsExist();

        let transactionId = transaction ? transaction.bankTransactionID : undefined;

        let filesToUpload = newTransaction.files;

        let existingFileNames: string[] = [];

        if (!transactionId) {
            logger.info('Bank transaction will be created');

            const createData = this.getTransactionData(
                newTransaction,
                generalExpenseAccount,
                feesExpenseAccount,
            );

            try {
                transactionId = await this.xeroClient.createTransaction(createData);
            } catch (err: any) {
                const createDataFallback = await this.tryFallbackItemData(
                    err,
                    createData,
                    generalExpenseAccount.code,
                    generalExpenseAccount.taxType,
                    logger,
                );

                transactionId = await this.xeroClient.createTransaction(createDataFallback);
            }

            logger.info('Bank transaction created successfully');
        } else {
            logger.info('Bank transaction will be updated');

            const updateData = {
                transactionId,
                ...this.getTransactionData(
                    newTransaction,
                    generalExpenseAccount,
                    feesExpenseAccount,
                ),
            };

            try {
                await this.xeroClient.updateTransaction(updateData);
            } catch (err: any) {
                const updateDataFallback = await this.tryFallbackItemData(
                    err,
                    updateData,
                    generalExpenseAccount.code,
                    generalExpenseAccount.taxType,
                    logger,
                );

                await this.xeroClient.updateTransaction(updateDataFallback);
            }

            logger.info('Bank transaction updated successfully');

            if (filesToUpload.length > 0) {
                const existingFiles = await this.xeroClient.getTransactionAttachments(transactionId);
                existingFileNames = existingFiles.map(f => f.fileName);

                filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(f.fileName));
            }
        }

        if (filesToUpload.length > 0) {
            const totalAttachments = filesToUpload.length + existingFileNames.length;
            if (totalAttachments > MAX_ATTACHMENTS_PER_DOCUMENT) {
                throw new ExportError(`Failed to export expense into Xero. You are trying to upload a total of ${totalAttachments} file attachments which exceeds the maximum allowed of ${MAX_ATTACHMENTS_PER_DOCUMENT}.`);
            }

            // Files should be uploaded in the right order so Promise.all is no good
            for (const f of filesToUpload) {
                const fileName = f.fileName;
                await this.xeroClient.uploadTransactionAttachment(transactionId, fileName, f.path, f.contentType);
            }
        }

        return transactionId;
    }

    async getBankTransactionByUrl(url: string): Promise<Xero.IBankTransaction | undefined> {
        const bankTransaction = await this.xeroClient.getTransactionByUrl(url);
        return bankTransaction ? bankTransaction : undefined;
    }

    async getBillByUrl(url: string): Promise<Xero.IInvoice | undefined> {
        const bill = await this.xeroClient.getBillByUrl(url);
        return bill ? bill : undefined;
    }

    async deleteAccountTransaction(transactionUrl: string): Promise<void> {
        const transaction = await this.xeroClient.getTransactionByUrl(transactionUrl);
        if (!transaction) {
            throw Error('Transaction not found');;
        }

        if (transaction.isReconciled) {
            throw Error('Transaction is reconciled and cannot be deleted');
        }

        await this.xeroClient.deleteTransaction(transaction.bankTransactionID);
    }

    async createOrUpdateBill(newBill: INewBill): Promise<string> {
        const bill = await this.xeroClient.getBillByUrl(newBill.url);

        const logger = this.logger.child({ billId: bill ? bill.invoiceID : undefined });

        const [generalExpenseAccount, feesExpenseAccount] = await this.ensureDefaultExpenseAccountsExist();

        let billId: string;
        let filesToUpload = newBill.files;
        let existingFileNames: string[] = [];

        const billData = this.getBillData(
            newBill,
            generalExpenseAccount,
            feesExpenseAccount,
        );

        if (!bill) {
            logger.info('Bill will be created');

            try {
                billId = await this.xeroClient.createBill(billData);
            } catch (err: any) {
                const createDataFallback = await this.tryFallbackItemData(
                    err,
                    billData,
                    generalExpenseAccount.code,
                    generalExpenseAccount.taxType,
                    logger,
                );

                billId = await this.xeroClient.createBill(createDataFallback);
            }
        } else {
            logger.info('Bill will be updated');

            billId = bill.invoiceID;

            const updateData: Xero.IUpdateBillData = {
                billId,
                ...billData,
            };

            if (bill.status === Xero.InvoiceStatus.VOIDED || bill.status === Xero.InvoiceStatus.DELETED) {
                this.logger.warn('Bill is deleted and cannot be updated');
                return bill.invoiceID;
            }

            if (bill.status === Xero.InvoiceStatus.PAID && bill.payments && bill.payments.length > 0) {
                const canDeleteExistingPayments = newBill.payments && newBill.payments.length === bill.payments.length;
                if (!canDeleteExistingPayments) {
                    logger.warn('Existing bill payments cannot be deleted, not paid with Payhawk');
                    return bill.invoiceID;
                }

                const hasReconciledPayment = bill.payments.some(p => p.isReconciled);
                if (hasReconciledPayment) {
                    throw new ExportError('Failed to export expense into Xero. Payments have been reconciled');
                }

                const anyPaymentIsBatch = bill.payments.some(p => p.batchPaymentID !== undefined);
                if (anyPaymentIsBatch) {
                    logger.info('Payment is part of a batch payment, no updates will be performed');
                    return bill.invoiceID;
                }

                for (const payment of bill.payments) {
                    await this.deletePayment(payment.paymentID);
                }
            }

            try {
                await this.xeroClient.updateBill(updateData);
            } catch (err: any) {
                const skipUpdates = err.message.includes(DOCUMENT_DATE_IN_LOCKED_PERIOD_MESSAGE);
                if (!skipUpdates) {
                    const updateDataFallback = await this.tryFallbackItemData(
                        err,
                        updateData,
                        generalExpenseAccount.code,
                        generalExpenseAccount.taxType,
                        logger,
                    );

                    await this.xeroClient.updateBill(updateDataFallback);
                }
            }

            if (filesToUpload.length > 0) {
                const existingFiles = await this.xeroClient.getBillAttachments(billId);
                existingFileNames = existingFiles.map(f => f.fileName);

                filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(f.fileName));
            }
        }

        if (filesToUpload.length > 0) {
            const totalAttachments = filesToUpload.length + existingFileNames.length;
            if (totalAttachments > MAX_ATTACHMENTS_PER_DOCUMENT) {
                throw new ExportError(`Failed to export expense into Xero. You are trying to upload a total of ${totalAttachments} file attachments which exceeds the maximum allowed of ${MAX_ATTACHMENTS_PER_DOCUMENT}.`);
            }

            // Files should be uploaded in the right order so Promise.all is no good
            for (const f of filesToUpload) {
                const fileName = f.fileName;
                await this.xeroClient.uploadBillAttachment(billId, fileName, f.path, f.contentType);
            }
        }

        if (newBill.isPaid && newBill.payments !== undefined && newBill.payments.length > 0) {
            logger.info('Expense is paid and new payments will be created for this bill');

            for (const paymentInfo of newBill.payments) {
                const { date, bankAccountId, amount, fxFees = 0, bankFees = 0, posFees = 0, currency } = paymentInfo;

                const paymentData: Xero.IPaymentData = {
                    date,
                    amount: sumAmounts(amount, fxFees, bankFees, posFees),
                    fxRate: billData.fxRate,
                    currency,
                    bankAccountId,
                    itemId: billId,
                    itemType: Xero.PaymentItemType.Invoice,
                };

                await this.xeroClient.createPayment(paymentData);
            }
        }

        return billId;
    }

    async getBillPayment(paymentId: string): Promise<Xero.IPayment | undefined> {
        return this.xeroClient.getPayment(paymentId);
    }

    async deleteBill(billUrl: string) {
        let logger = this.logger.child({ billUrl });

        const bill = await this.xeroClient.getBillByUrl(billUrl);
        if (!bill) {
            logger.info('Bill not found, nothing to delete');
            return;
        }

        logger = logger.child({ billId: bill.invoiceID, billStatus: bill.status });

        if (bill.status === Xero.InvoiceStatus.PAID) {
            const billPayments = bill.payments || [];
            if (billPayments.length > 0) {
                const hasReconciledPayment = billPayments.some(p => p.isReconciled);
                if (hasReconciledPayment) {
                    throw new ExportError('Failed to delete expense from Xero. Payments have been reconciled');
                }

                for (const billPayment of billPayments) {
                    const paymentId = billPayment.paymentID;
                    await this.deletePayment(paymentId);
                }
            }
        }

        logger.info('Deleting invoice');
        await this.xeroClient.deleteBill(bill.invoiceID);
        logger.info('Invoice deleted');
    }

    async deletePayment(paymentId: string) {
        const logger = this.logger.child({ paymentId });

        logger.info('Deleting bill payment');

        await this.xeroClient.accounting.deletePayment(paymentId);

        logger.info('Bill payment deleted');
    }

    async getCreditNoteByNumber(creditNoteNumber: string): Promise<Xero.ICreditNote | undefined> {
        return await this.xeroClient.getCreditNoteByNumber(creditNoteNumber);
    }

    async createOrUpdateCreditNote(newCreditNote: INewCreditNoteEntity): Promise<string> {
        const creditNote = await this.xeroClient.getCreditNoteByNumber(newCreditNote.creditNoteNumber);

        const logger = this.logger.child({ creditNoteNumber: creditNote ? creditNote.creditNoteNumber : undefined });

        const [generalExpenseAccount, feesExpenseAccount] = await this.ensureDefaultExpenseAccountsExist();

        let creditNoteId: string;
        let filesToUpload = newCreditNote.files;
        let existingFileNames: string[] = [];

        const creditNoteData = this.getCreditNoteData(
            newCreditNote,
            generalExpenseAccount,
            feesExpenseAccount,
        );

        if (!creditNote) {
            logger.info('Credit note will be created');

            try {
                creditNoteId = await this.xeroClient.createCreditNote(creditNoteData);
            } catch (err: any) {
                const createDataFallback = await this.tryFallbackItemData(
                    err,
                    creditNoteData,
                    generalExpenseAccount.code,
                    generalExpenseAccount.taxType,
                    logger,
                );

                creditNoteId = await this.xeroClient.createCreditNote(createDataFallback);
            }
        } else {
            logger.info('Credit note will be updated');

            creditNoteId = creditNote.creditNoteID;

            const updateData: Xero.ICreditNoteData = {
                ...creditNoteData,
            };

            if (creditNote.status === Xero.CreditNoteStatus.VOIDED || creditNote.status === Xero.CreditNoteStatus.DELETED) {
                this.logger.warn('Credit note is deleted and cannot be updated');
                return creditNote.creditNoteID;
            }

            if (creditNote.status === Xero.CreditNoteStatus.PAID && creditNote.payments && creditNote.payments.length > 0) {
                for (const payment of creditNote.payments) {
                    await this.deletePayment(payment.paymentID);
                }
            }

            try {
                await this.xeroClient.updateCreditNote(updateData);
            } catch (err: any) {
                const skipUpdates = err.message.includes(DOCUMENT_DATE_IN_LOCKED_PERIOD_MESSAGE);
                if (!skipUpdates) {
                    const updateDataFallback = await this.tryFallbackItemData(
                        err,
                        updateData,
                        generalExpenseAccount.code,
                        generalExpenseAccount.taxType,
                        logger,
                    );

                    await this.xeroClient.updateCreditNote(updateDataFallback);
                }
            }

            if (filesToUpload.length > 0) {
                const existingFiles = await this.xeroClient.getCreditNoteAttachments(creditNoteId);
                existingFileNames = existingFiles.map(f => f.fileName);

                filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(f.fileName));
            }
        }

        if (filesToUpload.length > 0) {
            const totalAttachments = filesToUpload.length + existingFileNames.length;
            if (totalAttachments > MAX_ATTACHMENTS_PER_DOCUMENT) {
                throw new ExportError(`Failed to export expense into Xero. You are trying to upload a total of ${totalAttachments} file attachments which exceeds the maximum allowed of ${MAX_ATTACHMENTS_PER_DOCUMENT}.`);
            }

            // Files should be uploaded in the right order so Promise.all is no good
            for (const f of filesToUpload) {
                const fileName = f.fileName;
                await this.xeroClient.uploadCreditNoteAttachment(creditNoteId, fileName, f.path, f.contentType);
            }
        }

        if (newCreditNote.payments !== undefined && newCreditNote.payments.length > 0) {
            logger.info('Expense is paid and new payments will be created for this credit note');

            for (const paymentInfo of newCreditNote.payments) {
                const { date, bankAccountId, amount, fxFees = 0, bankFees = 0, posFees = 0, currency } = paymentInfo;

                const paymentData: Xero.IPaymentData = {
                    date,
                    amount: Math.abs(sumAmounts(amount, fxFees, bankFees, posFees)),
                    currency,
                    bankAccountId,
                    itemId: creditNoteId,
                    itemType: Xero.PaymentItemType.CreditNote,
                };

                await this.xeroClient.createPayment(paymentData);
            }
        }

        return creditNoteId;
    }

    async deleteCreditNote(creditNoteNumber: string) {
        let logger = this.logger.child({ creditNoteNumber });

        const creditNote = await this.xeroClient.getCreditNoteByNumber(creditNoteNumber);
        if (!creditNote) {
            logger.info('Credit note not found, nothing to delete');
            return;
        }

        logger = logger.child({ creditNoteNumber, creditNoteStatus: creditNote.status });

        if (creditNote.status === Xero.CreditNoteStatus.PAID) {
            const creditNotePayments = creditNote.payments || [];
            if (creditNotePayments.length > 0) {
                const hasReconciledPayment = creditNotePayments.some(p => p.isReconciled);
                if (hasReconciledPayment) {
                    throw new ExportError('Failed to delete expense from Xero. Payments have been reconciled');
                }

                for (const creditNotePayment of creditNotePayments) {
                    const paymentId = creditNotePayment.paymentID;
                    await this.deletePayment(paymentId);
                }
            }
        }

        logger.info('Deleting credit note');
        await this.xeroClient.deleteCreditNote(creditNoteNumber);
        logger.info('Credit note deleted');
    }

    async ensureDefaultExpenseAccountsExist(): Promise<IAccountCode[]> {
        // we get all expense accounts because the Xero API does not allow "OR" filters
        const expenseAccounts = await this.xeroClient.accounting.getExpenseAccounts();

        let generalExpenseAccount = expenseAccounts.find(
            x => x.name.toLowerCase() === DEFAULT_ACCOUNT_NAME.toLowerCase() ||
                x.code === DEFAULT_ACCOUNT_CODE,
        );

        if (!generalExpenseAccount) {
            generalExpenseAccount = await this.xeroClient.accounting.createExpenseAccount({
                name: DEFAULT_ACCOUNT_NAME,
                code: DEFAULT_ACCOUNT_CODE,
                description: 'Payhawk General is used as a fallback account for all bills coming from Payhawk. It will store expenses which are not yet reviewed but have payments or expenses which were not mapped to the correct Xero account code. All bill payments which were reversed or bounced from the receiving bank will be recorded to this account.',
                addToWatchlist: true,
            });
        }

        let feesExpenseAccount = expenseAccounts.find(
            x => x.name.toLowerCase() === FEES_ACCOUNT_NAME.toLowerCase() ||
                x.code === FEES_ACCOUNT_CODE,
        );

        if (!feesExpenseAccount) {
            const taxRates = await this.xeroClient.accounting.getTaxRates();

            const feesTaxRate = taxRates.find(f => FEES_TAX_TYPES.includes(f.taxType));
            const feesTaxType = feesTaxRate ? feesTaxRate.taxType as TaxType : undefined;
            if (!feesTaxType) {
                this.logger.info(`Fees expense account will be created using default Xero tax type. Tax types ${TaxType.None} and ${TaxType.ExemptExpenses} do not exist`);
            } else {
                this.logger.info(`Using tax rate type ${feesTaxType} for Fees expense account`);
            }

            feesExpenseAccount = await this.xeroClient.accounting.createExpenseAccount({
                name: FEES_ACCOUNT_NAME,
                code: FEES_ACCOUNT_CODE,
                description: 'Stores all POS, FX and bank transfer fees for payments coming through Payhawk.',
                taxType: feesTaxType,
                addToWatchlist: true,
            });
        }

        if (generalExpenseAccount.status !== AccountStatus.Active) {
            throw Error(`Default general expense account is required but it is currently of status '${generalExpenseAccount.status}'`);
        }

        if (feesExpenseAccount.status !== AccountStatus.Active) {
            throw Error(`Default fees expense account is required but it is currently of status '${feesExpenseAccount.status}'`);
        }

        return [generalExpenseAccount, feesExpenseAccount];
    }

    private async tryFallbackItemData<TData extends Pick<Xero.IAccountingItemData, 'accountCode' | 'taxType'>>(error: Error, data: TData, defaultAccountCode: string, taxExemptCode: string, logger: ILogger): Promise<TData> {
        if (INVALID_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message) || ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message)) {
            logger.info(`Invalid account code for this item, falling back to default account code ${defaultAccountCode}`);
            data.accountCode = defaultAccountCode;
        } else if (error.message.includes(TAX_TYPE_IS_MANDATORY_MESSAGE)) {
            data.taxType = taxExemptCode;
        } else {
            throw error;
        }

        return data;
    }

    private getTransactionData(
        {
            date,
            bankAccountId,
            contactId,
            description,
            reference,
            amount,
            fxFees,
            posFees,
            accountCode,
            taxExempt,
            taxType,
            url,
            trackingCategories,
        }: INewAccountTransaction,

        defaultAccount: IAccountCode,
        taxExemptAccount: IAccountCode,
    ): Xero.ICreateTransactionData {
        return {
            date,
            bankAccountId,
            contactId,
            description: description || DEFAULT_DESCRIPTION,
            reference,
            amount,
            fxFees,
            posFees,
            feesAccountCode: taxExemptAccount.code,
            accountCode: accountCode || defaultAccount.code,
            taxType: taxExempt ? taxExemptAccount.taxType : taxType,
            url,
            trackingCategories,
            lineItems: [{
                accountCode: accountCode || defaultAccount.code,
                amount: Math.abs(amount),
                taxType: taxExempt ? taxExemptAccount.taxType : taxType,
                trackingCategories,
            }],
        };
    }

    private getBillData({
        date,
        dueDate,
        isPaid,
        contactId,
        description,
        reference,
        currency,
        totalAmount,
        accountCode,
        taxType,
        url,
        trackingCategories,
        payments: paymentData = [],
        lineItems = [],
    }: INewBill,

        defaultAccount: IAccountCode,
        taxExemptAccount: IAccountCode,
    ): Xero.ICreateBillData {
        const fxFees = sumAmounts(...paymentData.map(d => d.fxFees || 0));
        const posFees = sumAmounts(...paymentData.map(d => d.posFees || 0));
        const bankFees = sumAmounts(...paymentData.map(d => d.bankFees || 0));

        return {
            date,
            dueDate: dueDate || date,
            isPaid,
            contactId,
            description: description || DEFAULT_DESCRIPTION,
            reference: reference || DEFAULT_REFERENCE,
            currency,
            amount: totalAmount,
            fxFees,
            posFees,
            bankFees,
            accountCode: accountCode || defaultAccount.code,
            feesAccountCode: taxExemptAccount.code,
            taxType,
            url,
            trackingCategories,
            lineItems: lineItems.map(l => ({
                accountCode: l.accountCode || defaultAccount.code,
                amount: l.amount,
                taxAmount: l.taxAmount,
                taxType: l.taxType,
                trackingCategories: l.trackingCategories,
            })),
        };
    }

    private getCreditNoteData({
        date,
        contactId,
        description = DEFAULT_DESCRIPTION,
        totalAmount,
        currency,
        creditNoteNumber,
        accountCode,
        taxType,
        lineItems = [],
        trackingCategories,
    }: INewCreditNoteEntity,

        defaultAccount: IAccountCode,
        taxExemptAccount: IAccountCode,
    ): Xero.ICreditNoteData {
        return {
            date,
            contactId,
            creditNoteNumber,
            currency,
            accountCode: accountCode || defaultAccount.code,
            taxType,
            description,
            reference: creditNoteNumber,
            amount: totalAmount,
            bankFees: 0,
            fxFees: 0,
            posFees: 0,
            feesAccountCode: taxExemptAccount.code,
            lineItems: lineItems.map(l => ({
                amount: l.amount,
                taxAmount: l.taxAmount,
                accountCode: l.accountCode || defaultAccount.code,
                taxType: l.taxType,
                trackingCategories: l.trackingCategories,
            })),
            trackingCategories,
        };
    }
}

export const getExpenseNumber = (expenseId: string) => `expense-${expenseId}`;
export const getTransferNumber = (transferId: string) => `transfer-${transferId}`;
export const getTransactionNumber = (transactionId: string) => `transaction-${transactionId}`;

export const getTransactionExternalUrl = (organisationShortCode: string, transactionId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/Bank/ViewTransaction.aspx?bankTransactionID=${encodeURIComponent(transactionId)}`;
};

export const getBillExternalUrl = (organisationShortCode: string, invoiceId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/AccountsPayable/Edit.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
};

export const getCreditNoteExternalUrl = (organisationShortCode: string, creditNoteId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/AccountsPayable/ViewCreditNote.aspx?creditNoteId=${encodeURIComponent(creditNoteId)}`;
};

export const DEFAULT_REFERENCE = '(no invoice number)';

const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const MAX_ATTACHMENTS_PER_DOCUMENT = 10;

const FEES_TAX_TYPES: string[] = [TaxType.None, TaxType.ExemptExpenses];
