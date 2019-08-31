import * as path from 'path';

import { Payhawk, Xero } from '../../services';
import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';

const DEFAULT_ACCOUNT_CODE = '429';
const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const DEFAULT_CURRENCY = 'GBP';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        return await this.xeroClient.getExpenseAccounts();
    }

    async getContactIdForSupplier(supplier: Pick<Payhawk.ISupplier, 'name' | 'vat'>): Promise<string> {
        const contactName = supplier.name || DEFAULT_SUPPLIER_NAME;
        const contact = await this.xeroClient.findContact(contactName, supplier.vat) ||
            await this.xeroClient.createContact(contactName, supplier.name ? supplier.vat : undefined);

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

    async createOrUpdateAccountTransaction({
        bankAccountId,
        contactId,
        description,
        reference,
        totalAmount,
        accountCode,
        files,
        url,
    }: INewAccountTransaction): Promise<void> {
        let transactionId = await this.xeroClient.getTransactionIdByUrl(url);
        let filesToUpload = files;

        if (!transactionId) {
            transactionId = await this.xeroClient.createTransaction(
                bankAccountId,
                contactId,
                description || DEFAULT_DESCRIPTION,
                reference,
                totalAmount,
                accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            );
        } else {
            await this.xeroClient.updateTransaction(
                transactionId,
                bankAccountId,
                contactId,
                description || DEFAULT_DESCRIPTION,
                reference,
                totalAmount,
                accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            );

            const existingFileNames = (await this.xeroClient.getTransactionAttachments(transactionId)).map(f => f.FileName);

            filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(convertPathToFileName(f.path)));
        }

        // Files should be uploaded in the right order so Promise.all is no good
        for (const f of filesToUpload) {
            const fileName = convertPathToFileName(f.path);
            await this.xeroClient.uploadTransactionAttachment(transactionId, fileName, f.path, f.contentType);
        }
    }

    async createOrUpdateBill({
        contactId,
        description,
        currency,
        totalAmount,
        accountCode,
        files,
        url,
    }: INewBill): Promise<void> {
        let billId = await this.xeroClient.getBillIdByUrl(url);
        let filesToUpload = files;

        if (!billId) {
            billId = await this.xeroClient.createBill(
                contactId,
                description || DEFAULT_DESCRIPTION,
                currency || DEFAULT_CURRENCY,
                totalAmount || 0,
                accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            );
        } else {
            await this.xeroClient.updateBill(
                billId,
                contactId,
                description || DEFAULT_DESCRIPTION,
                currency || DEFAULT_CURRENCY,
                totalAmount || 0,
                accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            );

            const existingFileNames = (await this.xeroClient.getBillAttachments(billId)).map(f => f.FileName);

            filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(convertPathToFileName(f.path)));
        }

        // Files should be uploaded in the right order so Promise.all is no good
        for (const f of filesToUpload) {
            const fileName = convertPathToFileName(f.path);
            await this.xeroClient.uploadBillAttachment(billId, fileName, f.path, f.contentType);
        }
    }
}

function convertPathToFileName(filePath: string): string {
    return path.basename(filePath);
}

const defBankAccountNumber = (currency: string) => `PAYHAWK-${currency}`;
const defBankAccountCode = (currency: string) => `PHWK-${currency}`;
const defBankAccountName = (currency: string) => `Payhawk ${currency}`;
