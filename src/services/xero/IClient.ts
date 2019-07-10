import { Contact } from 'xero-node/lib/AccountingAPI-models';

import { IAccountCode } from './IAccountCode';
import { IBankAccount } from './IBankAccount';

export interface IClient {
    findContact(name: string, vat?: string): Promise<Contact|undefined>;
    createContact(name: string, vat?: string): Promise<Contact>;
    getBankAccountByCode(code: string): Promise<IBankAccount|undefined>;
    activateBankAccount(bankAccount: IBankAccount): Promise<IBankAccount>;
    createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount>;
    getExpenseAccounts(): Promise<IAccountCode[]>;
    createTransaction(bankAccountId: string, contactId: string, description: string, reference: string, amount: number, accountCode?: string): Promise<void>;
    createBill(contactId: string, description: string, currency: string, amount: number, accountCode?: string): Promise<void>;
}
