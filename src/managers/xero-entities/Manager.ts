import { Payhawk, Xero } from '@services';
import { AccountStatus, DEFAULT_ACCOUNT_CODE, DEFAULT_ACCOUNT_NAME, FEES_ACCOUNT_CODE, FEES_ACCOUNT_NAME, ITaxRate, TaxType } from '@shared';
import { ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX, ExportError, fromDateTicks, ILogger, INVALID_ACCOUNT_CODE_MESSAGE_REGEX } from '@utils';

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
        this.bankFeeds = createBankFeedsManager(this.xeroClient);
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

    async getContactIdForSupplier(supplier: Pick<Payhawk.ISupplier, 'name' | 'vat'>): Promise<string> {
        const contactName = supplier.name || DEFAULT_SUPPLIER_NAME;
        let contact = await this.xeroClient.findContact(contactName, supplier.vat);
        if (!contact) {
            contact = await this.xeroClient.getOrCreateContact(contactName, supplier.name ? supplier.vat : undefined);
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

        const [generalExpenseAccount] = await this.ensureDefaultExpenseAccountsExist();

        let billId: string;
        let filesToUpload = newBill.files;
        let existingFileNames: string[] = [];

        const billData = this.getBillData(newBill);
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

            if (bill.status === Xero.InvoiceStatus.PAID) {
                this.logger.warn('Bill is already paid. It cannot be updated.');
                return bill.invoiceID;
            }

            const isAwaitingPayment = bill.status === Xero.InvoiceStatus.AUTHORISED;
            if (isAwaitingPayment && !updateData.isPaid) {
                this.logger.warn(`Bill is already authorised and is expecting a payment. Bill cannot be updated at this point`);
                return bill.invoiceID;
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

        if (newBill.isPaid && newBill.paymentDate && newBill.bankAccountId && newBill.totalAmount > 0) {
            logger.info('Expense is paid and a new payment will be created for this bill');
            const paymentData: Xero.IBillPaymentData = {
                date: newBill.paymentDate,
                amount: billData.amount,
                fxRate: billData.fxRate,
                currency: billData.currency,
                bankAccountId: newBill.bankAccountId,
                billId,
            };

            await this.xeroClient.payBill(paymentData);
        }

        return billId;
    }

    async getBillPayment(paymentId: string): Promise<Xero.IPayment | undefined> {
        return this.xeroClient.getBillPayment(paymentId);
    }

    async deleteBill(billUrl: string) {
        const bill = await this.xeroClient.getBillByUrl(billUrl);
        if (!bill) {
            this.logger.info('Bill not found, nothing to delete');
            return;
        }

        if (bill.status === Xero.InvoiceStatus.PAID) {
            throw new ExportError('Export expense into Xero failed. Bill is already paid and cannot be modified or deleted');
        }

        await this.xeroClient.deleteBill(bill.invoiceID);
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
        if (INVALID_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message) || ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message)) {
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
        };
    }

    private getBillData({
        date,
        dueDate,
        isPaid,
        contactId,
        description,
        currency,
        fxRate,
        totalAmount,
        accountCode,
        taxType,
        url,
    }: INewBill): Xero.ICreateBillData {
        return {
            date,
            dueDate: dueDate || date,
            isPaid,
            contactId,
            description: description || DEFAULT_DESCRIPTION,
            currency: currency || DEFAULT_CURRENCY,
            fxRate,
            amount: totalAmount || 0,
            accountCode: accountCode || DEFAULT_ACCOUNT_CODE,
            taxType,
            url,
        };
    }
}

export const getTransactionExternalUrl = (organisationShortCode: string, transactionId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/Bank/ViewTransaction.aspx?bankTransactionID=${encodeURIComponent(transactionId)}`;
};

export const getBillExternalUrl = (organisationShortCode: string, invoiceId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/AccountsPayable/Edit.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
};

const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const DEFAULT_CURRENCY = 'GBP';

const MAX_ATTACHMENTS_PER_DOCUMENT = 10;

const FEES_TAX_TYPES: string[] = [TaxType.None, TaxType.ExemptExpenses];
