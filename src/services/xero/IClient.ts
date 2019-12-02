import { Contact, Organisation } from 'xero-node/lib/AccountingAPI-models';

import { IAccountCode } from './IAccountCode';
import { IAttachment } from './IAttachment';
import { IBankAccount } from './IBankAccount';

export interface IClient {
    getOrganisation(): Promise<Organisation | undefined>;

    findContact(name: string, vat?: string): Promise<Contact | undefined>;
    createContact(name: string, vat?: string): Promise<Contact>;

    getBankAccountByCode(code: string): Promise<IBankAccount | undefined>;
    activateBankAccount(bankAccount: IBankAccount): Promise<IBankAccount>;
    createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount>;

    getExpenseAccounts(): Promise<IAccountCode[]>;

    getTransactionIdByUrl(url: string): Promise<string | undefined>;
    createTransaction(data: ICreateTransactionData): Promise<string>;
    updateTransaction(data: IUpdateTransactionData): Promise<void>;
    getTransactionAttachments(entityId: string): Promise<IAttachment[]>;
    uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string): Promise<void>;

    getBillIdByUrl(url: string): Promise<string | undefined>;
    createBill(data: ICreateBillData): Promise<string>;
    updateBill(data: IUpdateBillData): Promise<void>;
    uploadBillAttachment(billId: string, fileName: string, filePath: string, contentType: string): Promise<void>;
    getBillAttachments(entityId: string): Promise<IAttachment[]>;
}

export interface IAccountingItemData {
    date: string;
    contactId: string;
    description: string;
    amount: number;
    accountCode: string;
    url: string;
}

export interface ICreateBillData extends IAccountingItemData {
    currency: string;
    dueDate?: string;
}

export interface IUpdateBillData extends ICreateBillData {
    billId: string;
}

export interface ICreateTransactionData extends IAccountingItemData {
    bankAccountId: string;
    reference: string;
}

export interface IUpdateTransactionData extends ICreateTransactionData {
    transactionId: string;
}
