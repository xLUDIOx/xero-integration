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
    createTransaction(date: string, bankAccountId: string, contactId: string, description: string, reference: string, amount: number, accountCode: string, url: string): Promise<string>;
    updateTransaction(transactionId: string, date: string, bankAccountId: string, contactId: string, description: string, reference: string, amount: number, accountCode: string, url: string): Promise<void>;
    getTransactionAttachments(entityId: string): Promise<IAttachment[]>;
    uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string): Promise<void>;

    getBillIdByUrl(url: string): Promise<string | undefined>;
    createBill(date: string, contactId: string, description: string, currency: string, amount: number, accountCode: string, url: string): Promise<string>;
    updateBill(billId: string, date: string, contactId: string, description: string, currency: string, amount: number, accountCode: string, url: string): Promise<void>;
    uploadBillAttachment(billId: string, fileName: string, filePath: string, contentType: string): Promise<void>;
    getBillAttachments(entityId: string): Promise<IAttachment[]>;
}
