import { Account } from 'xero-node';

import { Payhawk, Xero } from '@services';

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

    constructor(private readonly xeroClient: Xero.IClient) {
        this.bankAccounts = createBankAccountsManager(this.xeroClient);
        this.bankFeeds = createBankFeedsManager(this.xeroClient);
    }

    async getOrganisation(): Promise<IOrganisation> {
        const organisation = await this.xeroClient.getOrganisation();
        return organisation;
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        return await this.xeroClient.getExpenseAccounts();
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
        const transaction = await this.xeroClient.getTransactionByUrl(newTransaction.url);
        if (transaction && transaction.isReconciled) {
            return transaction.bankTransactionID;
        }

        let transactionId = transaction ? transaction.bankTransactionID : undefined;
        let filesToUpload = newTransaction.files;

        let existingFileNames: string[] = [];

        if (!transactionId) {
            const createData = this.getTransactionData(newTransaction);

            try {
                transactionId = await this.xeroClient.createTransaction(createData);
            } catch (err) {
                const createDataFallback = await this.tryFallbackItemData(err, createData);
                transactionId = await this.xeroClient.createTransaction(createDataFallback);
            }
        } else {
            const updateData = {
                transactionId,
                ...this.getTransactionData(newTransaction),
            };

            try {
                await this.xeroClient.updateTransaction(updateData);
            } catch (err) {
                const updateDataFallback = await this.tryFallbackItemData(err, updateData);
                await this.xeroClient.updateTransaction(updateDataFallback);
            }

            const existingFiles = await this.xeroClient.getTransactionAttachments(transactionId);
            existingFileNames = existingFiles.map(f => f.fileName);

            filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(f.fileName));
        }

        const totalAttachments = filesToUpload.length + existingFileNames.length;
        if (totalAttachments > MAX_ATTACHMENTS_PER_DOCUMENT) {
            throw Error(`The maximum allowed number of attachments is ${MAX_ATTACHMENTS_PER_DOCUMENT}. You are trying to upload a total of ${totalAttachments}`);
        }

        // Files should be uploaded in the right order so Promise.all is no good
        for (const f of filesToUpload) {
            const fileName = f.fileName;
            await this.xeroClient.uploadTransactionAttachment(transactionId, fileName, f.path, f.contentType);
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
            return;
        }

        if (transaction.isReconciled) {
            throw Error('Transaction is reconciled and cannot be deleted');
        }

        await this.xeroClient.deleteTransaction(transaction.bankTransactionID);
    }

    async createOrUpdateBill(newBill: INewBill): Promise<string> {
        const bill = await this.xeroClient.getBillByUrl(newBill.url);

        let billId: string;
        let filesToUpload = newBill.files;

        let existingFileNames: string[] = [];

        const billData = this.getBillData(newBill);
        if (!bill) {
            try {
                billId = await this.xeroClient.createBill(billData);
            } catch (err) {
                const createDataFallback = await this.tryFallbackItemData(err, billData);
                billId = await this.xeroClient.createBill(createDataFallback);
            }
        } else {
            billId = bill.invoiceID;

            const updateData: Xero.IUpdateBillData = {
                billId,
                ...billData,
            };

            try {
                await this.xeroClient.updateBill(updateData, bill);
            } catch (err) {
                const updateDataFallback = await this.tryFallbackItemData(err, updateData);
                await this.xeroClient.updateBill(updateDataFallback, bill);
            }

            const existingFiles = await this.xeroClient.getBillAttachments(billId);
            existingFileNames = existingFiles.map(f => f.fileName);

            filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(f.fileName));
        }

        const totalAttachments = filesToUpload.length + existingFileNames.length;
        if (totalAttachments > MAX_ATTACHMENTS_PER_DOCUMENT) {
            throw Error(`The maximum allowed number of attachments is ${MAX_ATTACHMENTS_PER_DOCUMENT}. You are trying to upload a total of ${totalAttachments}`);
        }

        if (newBill.isPaid && newBill.paymentDate && newBill.bankAccountId && newBill.totalAmount > 0) {
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

        // Files should be uploaded in the right order so Promise.all is no good
        for (const f of filesToUpload) {
            const fileName = f.fileName;
            await this.xeroClient.uploadBillAttachment(billId, fileName, f.path, f.contentType);
        }

        return billId;
    }

    async getBillPayment(paymentId: string): Promise<Xero.IPayment | undefined> {
        return this.xeroClient.getBillPayment(paymentId);
    }

    async deleteBill(billUrl: string) {
        const bill = await this.xeroClient.getBillByUrl(billUrl);
        if (!bill) {
            return;
        }

        if (bill.status === Xero.InvoiceStatus.PAID) {
            throw Error('Paid bill cannot be deleted');
        }

        await this.xeroClient.deleteBill(bill.invoiceID);
    }

    private async tryFallbackItemData<TData extends Xero.IAccountingItemData>(error: Error, data: TData): Promise<TData> {
        if (INVALID_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message)) {
            // Force default account code
            await this.ensureDefaultAccountCodeExists();

            data.accountCode = DEFAULT_ACCOUNT_CODE;
        } else {
            throw error;
        }

        return data;
    }

    private getTransactionData({
        date,
        bankAccountId,
        contactId,
        description,
        reference,
        totalAmount,
        accountCode,
        url,
    }: INewAccountTransaction): Xero.ICreateTransactionData {
        return {
            date,
            bankAccountId,
            contactId,
            description: description || DEFAULT_DESCRIPTION,
            reference,
            amount: totalAmount,
            accountCode: accountCode || DEFAULT_ACCOUNT_CODE,
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
            url,
        };
    }

    private async ensureDefaultAccountCodeExists() {
        const defaultExpenseAccount = await this.xeroClient.getOrCreateExpenseAccount({
            name: DEFAULT_ACCOUNT_NAME,
            code: DEFAULT_ACCOUNT_CODE,
            addToWatchlist: true,
        });

        if (defaultExpenseAccount.status !== Account.StatusEnum.ACTIVE) {
            throw Error(`Default expense account is required but it is currently of status '${defaultExpenseAccount.status}'`);
        }
    }
}

export const getTransactionExternalUrl = (organisationShortCode: string, transactionId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/Bank/ViewTransaction.aspx?bankTransactionID=${encodeURIComponent(transactionId)}`;
};

export const getBillExternalUrl = (organisationShortCode: string, invoiceId: string): string => {
    return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(organisationShortCode)}&redirecturl=/AccountsPayable/Edit.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
};

const INVALID_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' is not a valid code|Account code '.+' has been archived|Account must be valid/;

export const DEFAULT_ACCOUNT_CODE = '999999';
export const DEFAULT_ACCOUNT_NAME = 'PAYHAWK GENERAL';

const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const DEFAULT_CURRENCY = 'GBP';

const MAX_ATTACHMENTS_PER_DOCUMENT = 10;
