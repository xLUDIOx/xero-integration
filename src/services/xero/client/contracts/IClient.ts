import { Contact } from 'xero-node';

import { IAccountCode } from './IAccountCode';
import { IAttachment } from './IAttachment';
import { IBankAccount } from './IBankAccount';
import { IBankTransaction } from './IBankTransaction';
import { IInvoice } from './IInvoice';
import { IOrganisation } from './IOrganisation';

export interface IClient {
    getOrganisation(): Promise<IOrganisation | undefined>;

    findContact(name: string, vat?: string): Promise<Contact | undefined>;
    getOrCreateContact(name: string, vat?: string): Promise<Contact>;

    getBankAccounts(): Promise<IBankAccount[]>;
    getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined>;
    getBankAccountByCode(code: string): Promise<IBankAccount | undefined>;
    activateBankAccount(bankAccountId: string): Promise<IBankAccount>;
    createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount>;

    getExpenseAccounts(): Promise<IAccountCode[]>;

    getTransactionByUrl(url: string): Promise<IBankTransaction | undefined>;
    createTransaction(data: ICreateTransactionData): Promise<string>;
    updateTransaction(data: IUpdateTransactionData): Promise<void>;
    getTransactionAttachments(entityId: string): Promise<IAttachment[]>;
    uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string): Promise<void>;

    getBillByUrl(url: string): Promise<IInvoice | undefined>;
    createBill(data: ICreateBillData): Promise<string>;
    updateBill(data: IUpdateBillData, existingBill: IInvoice): Promise<void>;
    payBill(data: IBillPaymentData): Promise<void>;
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
    fxRate?: number;
    isPaid?: boolean;
    dueDate?: string;
}

export interface IUpdateBillData extends ICreateBillData {
    billId: string;
}

export interface IBillPaymentData extends Pick<IUpdateBillData, 'date' | 'amount' | 'billId' | 'currency' | 'fxRate'> {
    bankAccountId: string;
}

export interface ICreateTransactionData extends IAccountingItemData {
    bankAccountId: string;
    reference: string;
}

export interface IUpdateTransactionData extends ICreateTransactionData {
    transactionId: string;
}
