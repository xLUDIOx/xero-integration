import { Payhawk, Xero } from '../../services';
import { IAccountCode } from './IAccountCode';
import { IBankAccount } from './IBankAccount';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { IOrganisation } from './IOrganisation';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }

    async getOrganisation(): Promise<IOrganisation | undefined> {
        const organisation = await this.xeroClient.getOrganisation();
        return organisation;
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        return await this.xeroClient.getExpenseAccounts();
    }

    async getBankAccounts(): Promise<IBankAccount[]> {
        return await this.xeroClient.getBankAccounts();
    }

    async getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined> {
        return await this.xeroClient.getBankAccountById(bankAccountId);
    }

    async getContactIdForSupplier(supplier: Pick<Payhawk.ISupplier, 'name' | 'vat'>): Promise<string> {
        const contactName = supplier.name || DEFAULT_SUPPLIER_NAME;
        let contact = await this.xeroClient.findContact(contactName, supplier.vat);
        if (!contact) {
            contact = await this.xeroClient.getOrCreateContact(contactName, supplier.name ? supplier.vat : undefined);
        }

        return contact.ContactID!;
    }

    async getBankAccountIdForCurrency(currency: string): Promise<string> {
        const bankAccountCode = defBankAccountCode(currency);
        const bankAccountNumber = defBankAccountNumber(currency);
        const bankAccountName = defBankAccountName(currency);
        let bankAccount = await this.xeroClient.getBankAccountByCode(bankAccountCode);
        if (bankAccount) {
            if (bankAccount.Status === 'ARCHIVED') {
                bankAccount = await this.xeroClient.activateBankAccount(bankAccount);
            }
        } else {
            bankAccount = await this.xeroClient.createBankAccount(bankAccountName, bankAccountCode, bankAccountNumber, currency);
        }

        return bankAccount.AccountID!;
    }

    async createOrUpdateAccountTransaction(newTransaction: INewAccountTransaction): Promise<string> {
        const transaction = await this.xeroClient.getTransactionByUrl(newTransaction.url);
        if (transaction && transaction.isReconciled) {
            return transaction.id;
        }

        let transactionId = transaction ? transaction.id : undefined;
        let filesToUpload = newTransaction.files;

        if (!transactionId) {
            const createData = this.getTransactionData(newTransaction);

            try {
                transactionId = await this.xeroClient.createTransaction(createData);
            } catch (err) {
                const createDataFallback = this.tryFallbackItemData(err, createData);
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
                const updateDataFallback = this.tryFallbackItemData(err, updateData);
                await this.xeroClient.updateTransaction(updateDataFallback);
            }

            const existingFileNames = (await this.xeroClient.getTransactionAttachments(transactionId)).map(f => f.FileName);

            filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(f.fileName));
        }

        // Files should be uploaded in the right order so Promise.all is no good
        for (const f of filesToUpload) {
            const fileName = f.fileName;
            await this.xeroClient.uploadTransactionAttachment(transactionId, fileName, f.path, f.contentType);
        }

        return transactionId;
    }

    async createOrUpdateBill(newBill: INewBill): Promise<string> {
        let billId = await this.xeroClient.getBillIdByUrl(newBill.url);
        let filesToUpload = newBill.files;

        const billData = this.getBillData(newBill);
        if (!billId) {
            try {
                billId = await this.xeroClient.createBill(billData);
            } catch (err) {
                const createDataFallback = this.tryFallbackItemData(err, billData);
                billId = await this.xeroClient.createBill(createDataFallback);
            }
        } else {
            const updateData: Xero.IUpdateBillData = {
                billId,
                ...billData,
            };

            try {
                await this.xeroClient.updateBill(updateData);
            } catch (err) {
                const updateDataFallback = this.tryFallbackItemData(err, updateData);
                await this.xeroClient.updateBill(updateDataFallback);
            }

            const files = await this.xeroClient.getBillAttachments(billId);
            const existingFileNames = (files).map(f => f.FileName);

            filesToUpload = filesToUpload.filter(f => {
                const filePath = f.fileName;
                const isAlreadyUploaded = existingFileNames.includes(filePath);
                return !isAlreadyUploaded;
            });
        }

        if (newBill.isPaid && newBill.bankAccountId !== undefined) {
            const paymentData: Xero.IBillPaymentData = {
                date: billData.date,
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

    private tryFallbackItemData<TData extends Xero.IAccountingItemData>(error: Error, data: TData): TData {
        if (INVALID_ACCOUNT_CODE_MESSAGE_REGEX.test(error.message)) {
            // Force default account code
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
}

export const getTransactionExternalUrl = (transactionId: string, bankAccountId: string): string => {
    return `https://go.xero.com/Bank/ViewTransaction.aspx?bankTransactionId=${encodeURIComponent(transactionId)}&accountId=${encodeURIComponent(bankAccountId)}`;
};

export const getBillExternalUrl = (invoiceId: string): string => {
    return `https://go.xero.com/AccountsPayable/View.aspx?invoiceId=${encodeURIComponent(invoiceId)}`;
};

const INVALID_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' is not a valid code|Account code '.+' has been archived/;

const DEFAULT_ACCOUNT_CODE = '429';
const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const DEFAULT_CURRENCY = 'GBP';

const DEFAULT_SORT_CODE = '000000';

const defBankAccountNumber = (currency: string) => `${DEFAULT_SORT_CODE}-PAYHAWK-${currency}`;
// cspell:disable-next-line
const defBankAccountCode = (currency: string) => `PHWK-${currency}`;
const defBankAccountName = (currency: string) => `Payhawk ${currency}`;
