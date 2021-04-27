import { BankTransaction, Contact, Currency, Invoice } from 'xero-node';

import { KeyNameMap } from '@shared';

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
    // cspell:disable-next-line
    AccountsPayable = 'ACCPAY',
    // cspell:disable-next-line
    AccountsReceivable = 'ACCREC',
}

export enum InvoiceStatusCode {
    Draft = 'DRAFT', // Default
    Submitted = 'SUBMITTED',
    Deleted = 'DELETED',
    Authorised = 'AUTHORISED',
    Paid = 'PAID',
    Voided = 'VOIDED',
}

export enum LineAmountType {
    TaxInclusive = 'Inclusive',
    TaxExclusive = 'Exclusive', // Default
    NoTax = 'NoTax',
}

export const CurrencyKeys: KeyNameMap<Pick<Required<Currency>, 'code'>> = {
    code: 'code',
};

export const ContactKeys: KeyNameMap<Pick<Required<Contact>, 'name' | 'taxNumber' | 'emailAddress'>> = {
    name: 'name',
    taxNumber: 'taxNumber',
    emailAddress: 'emailAddress',
};

export const AccountingItemKeys: KeyNameMap<Pick<Required<BankTransaction & Invoice>, 'url' | 'status'>> = {
    status: 'status',
    url: 'url',
};
