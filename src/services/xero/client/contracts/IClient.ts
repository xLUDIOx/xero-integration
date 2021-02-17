import { Contact } from 'xero-node';

import { IClient as IAccountingClient } from '../accounting';
import { IClient as IAuthClient } from '../auth';
import { IClient as IBankFeedsClient } from '../bank-feeds';
import { IAttachment } from './IAttachment';
import { IBankAccount } from './IBankAccount';
import { IBankTransaction } from './IBankTransaction';
import { IInvoice } from './IInvoice';
import { IPayment } from './IPayment';

export interface IClient {
    auth: IAuthClient;
    accounting: IAccountingClient;
    bankFeeds: IBankFeedsClient;

    findContact(name: string, vat?: string): Promise<Contact | undefined>;
    getOrCreateContact(name: string, vat?: string): Promise<Contact>;

    getBankAccounts(): Promise<IBankAccount[]>;
    getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined>;
    getBankAccountByCodeOrName(code: string, name: string): Promise<IBankAccount | undefined>;
    createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount>;

    getTransactionByUrl(url: string): Promise<IBankTransaction | undefined>;
    createTransaction(data: ICreateTransactionData): Promise<string>;
    updateTransaction(data: IUpdateTransactionData): Promise<void>;
    deleteTransaction(transactionId: string): Promise<void>;
    getTransactionAttachments(billId: string): Promise<IAttachment[]>;
    uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string): Promise<void>;

    getBillByUrl(url: string): Promise<IInvoice | undefined>;
    createBill(data: ICreateBillData): Promise<string>;
    updateBill(data: IUpdateBillData): Promise<void>;
    deleteBill(billId: string): Promise<void>;
    payBill(data: IBillPaymentData): Promise<void>;
    getBillPayment(paymentId: string): Promise<IPayment | undefined>;
    uploadBillAttachment(billId: string, fileName: string, filePath: string, contentType: string): Promise<void>;
    getBillAttachments(billId: string): Promise<IAttachment[]>;
}

export interface IAccountingItemData {
    date: string;
    contactId: string;
    description: string;
    amount: number;
    accountCode: string;
    taxType?: string;
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
    fxFees: number;
    posFees: number;
    feesAccountCode: string;
}

export interface IUpdateTransactionData extends ICreateTransactionData {
    transactionId: string;
}
