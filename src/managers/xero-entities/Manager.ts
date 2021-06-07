import { Payhawk, Xero } from '@services';
import { AccountStatus, DEFAULT_ACCOUNT_CODE, DEFAULT_ACCOUNT_NAME, FEES_ACCOUNT_CODE, FEES_ACCOUNT_NAME, ITaxRate, ITrackingCategory, TaxType } from '@shared';
import { ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX, ExportError, fromDateTicks, ILogger, INVALID_ACCOUNT_CODE_MESSAGE_REGEX, sum, TAX_TYPE_IS_MANDATORY_MESSAGE } from '@utils';

import { create as createBankAccountsManager, IManager as IBankAccountsManager } from './bank-accounts';
import { create as createBankFeedsManager, IManager as IBankFeedsManager } from './bank-feeds';
import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
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

    async getContactForRecipient(recipient: Pick<Payhawk.IRecipient, 'name' | 'vat' | 'email'>): Promise<string> {
        const contactName = recipient.name || DEFAULT_SUPPLIER_NAME;
        let contact = await this.xeroClient.findContact(contactName, recipient.vat, recipient.email);
        if (!contact) {
            contact = await this.xeroClient.getOrCreateContact(contactName, recipient.name ? recipient.vat : undefined, recipient.email);
        }

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
            } catch (err) {
                const createDataFallback = await this.tryFallbackItemData(
                    err,
                    createData,
                    generalExpenseAccount.code,
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
            } catch (err) {
                const updateDataFallback = await this.tryFallbackItemData(
                    err,
                    updateData,
                    generalExpenseAccount.code,
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
            } catch (err) {
                const createDataFallback = await this.tryFallbackItemData(
                    err,
                    billData,
                    generalExpenseAccount.code,
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
                this.logger.warn('Bill is deleted.');
                return bill.invoiceID;
            }

            if (bill.status === Xero.InvoiceStatus.PAID && bill.payments && bill.payments.length > 0) {
                for (const payment of bill.payments) {
                    await this.deleteBillPayment(payment.paymentID);
                }
            }

            try {
                await this.xeroClient.updateBill(updateData);
            } catch (err) {
                const updateDataFallback = await this.tryFallbackItemData(
                    err,
                    updateData,
                    generalExpenseAccount.code,
                    logger,
                );

                await this.xeroClient.updateBill(updateDataFallback);
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

        if (newBill.isPaid && newBill.paymentData !== undefined && newBill.paymentData.length > 0) {
            logger.info('Expense is paid and new payments will be created for this bill');

            for (const paymentInfo of newBill.paymentData) {
                const { date, bankAccountId, amount, fxFees = 0, bankFees = 0, posFees = 0, currency } = paymentInfo;

                const paymentData: Xero.IBillPaymentData = {
                    date,
                    amount: sum(amount, fxFees, bankFees, posFees),
                    fxRate: billData.fxRate,
                    currency,
                    bankAccountId,
                    billId,
                };

                await this.xeroClient.payBill(paymentData);
            }
        }

        return billId;
    }

    async getBillPayment(paymentId: string): Promise<Xero.IPayment | undefined> {
        return this.xeroClient.getBillPayment(paymentId);
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
                    await this.deleteBillPayment(paymentId);
                }
            }
        }

        logger.info('Deleting invoice');
        await this.xeroClient.deleteBill(bill.invoiceID);
        logger.info('Invoice deleted');
    }

    async deleteBillPayment(paymentId: string) {
        const logger = this.logger.child({ paymentId });

        logger.info('Deleting bill payment');

        await this.xeroClient.accounting.deletePayment(paymentId);

        logger.info('Bill payment deleted');
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

    private async tryFallbackItemData<TData extends Xero.IAccountingItemData>(error: Error, data: TData, defaultAccountCode: string, logger: ILogger): Promise<TData> {
        if (INVALID_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message) || ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message) || error.message.includes(TAX_TYPE_IS_MANDATORY_MESSAGE)) {
            logger.info(`Bank transaction create failed, falling back to default account code ${defaultAccountCode}`);
            data.accountCode = defaultAccountCode;
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
        fxRate,
        totalAmount,
        accountCode,
        taxType,
        url,
        trackingCategories,
        paymentData = [],
    }: INewBill,

        defaultAccount: IAccountCode,
        taxExemptAccount: IAccountCode,
    ): Xero.ICreateBillData {
        const fxFees = sum(...paymentData.map(d => d.fxFees || 0));
        const posFees = sum(...paymentData.map(d => d.posFees || 0));
        const bankFees = sum(...paymentData.map(d => d.bankFees || 0));

        return {
            date,
            dueDate: dueDate || date,
            isPaid,
            contactId,
            description: description || DEFAULT_DESCRIPTION,
            reference: reference || DEFAULT_REFERENCE,
            currency,
            fxRate,
            amount: totalAmount,
            fxFees,
            posFees,
            bankFees,
            accountCode: accountCode || defaultAccount.code,
            feesAccountCode: taxExemptAccount.code,
            taxType,
            url,
            trackingCategories,
        };
    }
}

export const getTransactionExternalUrl = (organisationShortCode: string, transactionId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/Bank/ViewTransaction.aspx?bankTransactionID=${encodeURIComponent(transactionId)}`;
};

export const getBillExternalUrl = (organisationShortCode: string, invoiceId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/AccountsPayable/Edit.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
};

export const DEFAULT_REFERENCE = '(no invoice number)';

const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const MAX_ATTACHMENTS_PER_DOCUMENT = 10;

const FEES_TAX_TYPES: string[] = [TaxType.None, TaxType.ExemptExpenses];
