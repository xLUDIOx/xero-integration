import { BankTransaction, Contact, Currency, Invoice } from 'xero-node/lib/AccountingAPI-models';
import { KeyNameMap } from '../../utils';
import { IBankAccount } from './IBankAccount';

export enum ClientResponseStatus {
    Ok = 'OK',
    Error = 'ERROR',
}

export enum AccountType {
    Bank = 'BANK',
}

export enum AccountClassType {
    Asset = 'ASSET',
    Equity = 'EQUITY',
    Expense = 'EXPENSE',
    Liability = 'LIABILITY',
    Revenue = 'REVENUE',
}

export enum BankAccountType {
    Bank = 'BANK',
    CreditCard = 'CREDITCARD',
    Paypal = 'PAYPAL',
}

export enum BankAccountStatusCode {
    Active = 'ACTIVE',
    Archived = 'ARCHIVED',
}

export enum BankTransactionType {
    Receive = 'RECEIVE',
    ReceiveOverpayment = 'RECEIVE-OVERPAYMENT',
    ReceivePrepayment = 'RECEIVE-PREPAYMENT',

    Spend = 'SPEND',
    SpendOverpayment = 'SPEND-OVERPAYMENT',
    SpendPrepayment = 'SPEND-PREPAYMENT',
}

export enum BankTransactionStatusCode {
    Authorised = 'AUTHORISED',
    Deleted = 'DELETED',
}

export enum InvoiceType {
    AccountsPayable = 'ACCPAY',
    AccountsReceivable = 'ACCREC',
}

export enum InvoiceStatusCode {
    Draft = 'DRAFT',
    Submitted = 'SUBMITTED',
    Deleted = 'DELETED',
    Authorised = 'AUTHORISED',
    Paid = 'PAID',
    Voided = 'VOIDED',

    Default = Draft,
}

export enum LineAmountType {
    TaxInclusive = 'Inclusive',
    TaxExclusive = 'Exclusive', // Default
    NoTax = 'NoTax',
}

export const CurrencyKeys: KeyNameMap<Pick<Required<Currency>, 'Code'>> = {
    Code: 'Code',
};

export const ContactKeys: KeyNameMap<Pick<Required<Contact>, 'Name' | 'TaxNumber'>> = {
    Name: 'Name',
    TaxNumber: 'TaxNumber',
};

export const BankAccountKeys: KeyNameMap<Pick<Required<IBankAccount>, 'Code' | 'Type'>> = {
    Code: 'Code',
    Type: 'Type',
};

export const AccountingItemKeys: KeyNameMap<Pick<Required<BankTransaction & Invoice>, 'Url' | 'Status'>> = {
    Status: 'Status',
    Url: 'Url',
};