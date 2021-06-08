import { Contact } from 'xero-node';

import { IClient as IAccountingClient } from '../accounting';
import { IClient as IAuthClient } from '../auth';
import { IClient as IBankFeedsClient } from '../bank-feeds';
import { IAttachment } from './IAttachment';
import { IBankAccount } from './IBankAccount';
import { IBankTransaction } from './IBankTransaction';
import { ICreditNote } from './ICreditNote';
import { IInvoice } from './IInvoice';
import { IPayment } from './IPayment';

export interface IClient {
    auth: IAuthClient;
    accounting: IAccountingClient;
    bankFeeds: IBankFeedsClient;

    findContact(name: string, vat?: string, email?: string): Promise<Contact | undefined>;
    getOrCreateContact(name: string, vat?: string, email?: string): Promise<Contact>;

    getBankAccounts(): Promise<IBankAccount[]>;
    getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined>;
    getBankAccountByCodeOrName(code: string, name?: string): Promise<IBankAccount | undefined>;
    createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount>;

    getTransactionByUrl(url: string): Promise<IBankTransaction | undefined>;
    createTransaction(data: ICreateTransactionData): Promise<string>;
    updateTransaction(data: IUpdateTransactionData): Promise<void>;
    deleteTransaction(transactionId: string): Promise<void>;
    getTransactionAttachments(billId: string): Promise<IAttachment[]>;
    uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string): Promise<void>;

    getBillById(billId: string): Promise<IInvoice | undefined>;
    getBillByUrl(url: string): Promise<IInvoice | undefined>;
    createBill(data: ICreateBillData): Promise<string>;
    updateBill(data: IUpdateBillData): Promise<void>;
    deleteBill(billId: string): Promise<void>;
    uploadBillAttachment(billId: string, fileName: string, filePath: string, contentType: string): Promise<void>;
    getBillAttachments(billId: string): Promise<IAttachment[]>;

    getCreditNoteByNumber(creditNoteNumber: string): Promise<ICreditNote | undefined>;
    createCreditNote(data: ICreditNoteData): Promise<string>;
    updateCreditNote(data: ICreditNoteData): Promise<void>;
    deleteCreditNote(creditNoteId: string): Promise<void>;
    uploadCreditNoteAttachment(creditNoteId: string, fileName: string, filePath: string, contentType: string): Promise<void>;
    getCreditNoteAttachments(creditNoteId: string): Promise<IAttachment[]>;

    getPayment(paymentId: string): Promise<IPayment | undefined>;
    createPayment(data: IPaymentData): Promise<void>;
}

export interface IAccountingItemData {
    date: string;
    contactId: string;
    description: string;
    reference: string;
    amount: number;
    accountCode: string;
    taxType?: string;
    url: string;
    trackingCategories?: ITrackingCategoryValue[];
}

export interface ITrackingCategoryValue {
    categoryId: string;
    valueId: string;
}

export interface ICreateBillData extends IAccountingItemData {
    currency: string;
    fxRate?: number;
    isPaid?: boolean;
    dueDate?: string;
    fxFees: number;
    posFees: number;
    bankFees: number;
    feesAccountCode: string;
}

export interface ICreditNoteData extends Omit<IAccountingItemData, 'url'> {
    creditNoteNumber: string;
    currency: string;
    fxRate?: number;
    fxFees: number;
    posFees: number;
    bankFees: number;
    feesAccountCode: string;
}

export interface IUpdateBillData extends ICreateBillData {
    billId: string;
}

export interface IPaymentData extends Pick<IAccountingItemData, 'date' | 'amount'> {
    currency: string;
    fxRate?: number;
    bankAccountId: string;
    itemId: string;
    itemType: PaymentItemType;
}

export enum PaymentItemType {
    Invoice,
    CreditNote
}

export interface ICreateTransactionData extends IAccountingItemData {
    bankAccountId: string;
    fxFees: number;
    posFees: number;
    feesAccountCode: string;
}

export interface IUpdateTransactionData extends ICreateTransactionData {
    transactionId: string;
}
