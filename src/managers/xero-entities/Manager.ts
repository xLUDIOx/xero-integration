import * as path from 'path';

import { Payhawk, Xero } from '../../services';
import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }

    async getOrganisationName(): Promise<string | undefined> {
        const organisation = await this.xeroClient.getOrganisation();
        return organisation ? organisation.Name : undefined;
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        return await this.xeroClient.getExpenseAccounts();
    }

    async getContactIdForSupplier(supplier: Pick<Payhawk.ISupplier, 'name' | 'vat'>): Promise<string> {
        const contactName = supplier.name || DEFAULT_SUPPLIER_NAME;
        let contact = await this.xeroClient.findContact(contactName, supplier.vat);
        if (!contact) {
            contact = await this.xeroClient.createContact(contactName, supplier.name ? supplier.vat : undefined);
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

    async createOrUpdateAccountTransaction({
        date,
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
            const createData: Xero.ICreateTransactionData = {
                date,
                bankAccountId,
                contactId,
                description: description || DEFAULT_DESCRIPTION,
                reference,
                amount: totalAmount,
                accountCode: accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            };

            try {
                transactionId = await this.xeroClient.createTransaction(createData);
            } catch (err) {
                const createDataFallback = this.tryFallbackItemData(err, createData);
                transactionId = await this.xeroClient.createTransaction(createDataFallback);
            }
        } else {
            const updateData = {
                transactionId,
                date,
                bankAccountId,
                contactId,
                description: description || DEFAULT_DESCRIPTION,
                reference,
                amount: totalAmount,
                accountCode: accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            };

            try {
                await this.xeroClient.updateTransaction(updateData);
            } catch (err) {
                const updateDataFallback = this.tryFallbackItemData(err, updateData);
                await this.xeroClient.updateTransaction(updateDataFallback);
            }

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
        date,
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
            const createData: Xero.ICreateBillData = {
                date,
                contactId,
                description: description || DEFAULT_DESCRIPTION,
                currency: currency || DEFAULT_CURRENCY,
                amount: totalAmount || 0,
                accountCode: accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            };

            try {
                billId = await this.xeroClient.createBill(createData);
            } catch (err) {
                const createDataFallback = this.tryFallbackItemData(err, createData);
                billId = await this.xeroClient.createBill(createDataFallback);
            }
        } else {
            const updateData: Xero.IUpdateBillData = {
                billId,
                date,
                contactId,
                description: description || DEFAULT_DESCRIPTION,
                currency: currency || DEFAULT_CURRENCY,
                amount: totalAmount || 0,
                accountCode: accountCode || DEFAULT_ACCOUNT_CODE,
                url,
            };

            try {
                await this.xeroClient.updateBill(updateData);
            } catch (err) {
                const updateDataFallback = this.tryFallbackItemData(err, updateData);
                await this.xeroClient.updateBill(updateDataFallback);
            }

            const existingFileNames = (await this.xeroClient.getBillAttachments(billId)).map(f => f.FileName);

            filesToUpload = filesToUpload.filter(f => !existingFileNames.includes(convertPathToFileName(f.path)));
        }

        // Files should be uploaded in the right order so Promise.all is no good
        for (const f of filesToUpload) {
            const fileName = convertPathToFileName(f.path);
            await this.xeroClient.uploadBillAttachment(billId, fileName, f.path, f.contentType);
        }
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
}

function convertPathToFileName(filePath: string): string {
    return path.basename(filePath);
}

const INVALID_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' is not a valid code/;

const DEFAULT_ACCOUNT_CODE = '429';
const DEFAULT_DESCRIPTION = '(no note)';
const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

const DEFAULT_CURRENCY = 'GBP';

const DEFAULT_SORT_CODE = '000000';

const defBankAccountNumber = (currency: string) => `${DEFAULT_SORT_CODE}-PAYHAWK-${currency}`;
const defBankAccountCode = (currency: string) => `PHWK-${currency}`;
const defBankAccountName = (currency: string) => `Payhawk ${currency}`;
