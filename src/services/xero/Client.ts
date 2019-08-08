import * as path from 'path';
import { AccountingAPIClient as XeroClient } from 'xero-node';
import { BankTransaction, Contact } from 'xero-node/lib/AccountingAPI-models';
import { ContactsResponse } from 'xero-node/lib/AccountingAPI-responses';
import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { AttachmentsEndpoint } from 'xero-node/lib/AccountingAPIClient';
import { getXeroConfig } from './Config';
import { IAccountCode } from './IAccountCode';
import { IBankAccount } from './IBankAccount';
import { IClient } from './IClient';

export class Client implements IClient {
    private readonly xeroClient: XeroClient;

    constructor(accountId: string, accessToken: AccessToken) {
        this.xeroClient = new XeroClient(getXeroConfig(accountId), accessToken);
    }

    async findContact(name: string, vat?: string): Promise<Contact|undefined> {
        let contactsResponse: ContactsResponse;
        if (vat) {
            contactsResponse = await this.xeroClient.contacts.get({ where: `TaxNumber=="${this.escape(vat)}"` });
        } else {
            contactsResponse = await this.xeroClient.contacts.get({ where: `Name=="${this.escape(name)}"` });
        }

        return contactsResponse.Contacts.length > 0 ? contactsResponse.Contacts[0] : undefined;
    }

    async createContact(name: string, vat?: string): Promise<Contact> {
        const payload: Contact = {
            Name: name,
        };

        if (vat) {
            payload.TaxNumber = vat;
        }

        const contactsResponse = await this.xeroClient.contacts.create(payload);
        return contactsResponse.Contacts[0];
    }

    async activateBankAccount(bankAccount: IBankAccount): Promise<IBankAccount> {
        const bankAccountsResponse = await this.xeroClient.accounts.update({ Status: 'ACTIVE' }, { AccountID: bankAccount.AccountID });
        return bankAccountsResponse.Accounts[0];
    }

    async createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount> {
        await this.ensureCurrency(currencyCode);
        const bankAccountsResponse = await this.xeroClient.accounts.create({
            Name: name,
            Code: code,
            Type: 'BANK',
            BankAccountNumber: accountNumber,
            BankAccountType: 'CREDITCARD',
            CurrencyCode: currencyCode,
        });

        return bankAccountsResponse.Accounts[0];
    }

    async getBankAccountByCode(code: string): Promise<IBankAccount|undefined> {
        const bankAccountsResponse = await this.xeroClient.accounts.get({ where: `Type=="BANK" && Code=="${this.escape(code)}"` });
        return bankAccountsResponse.Accounts.length > 0 ? bankAccountsResponse.Accounts[0] : undefined;
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        const accountsResponse = await this.xeroClient.accounts.get({ where: 'Class=="EXPENSE"' });
        const xeroAccountCodes: IAccountCode[] = accountsResponse.Accounts;

        return xeroAccountCodes;
    }

    async transactionWithUrlExists(url: string): Promise<boolean> {
        const transactionsResponse = await this.xeroClient.bankTransactions.get({ where: `Url="${this.escape(url)}" && Status!="DELETED"` });
        return transactionsResponse.BankTransactions.length > 0;
    }

    async createTransaction(bankAccountId: string, contactId: string, description: string, reference: string, amount: number, accountCode: string, url: string): Promise<string> {
        const transaction: BankTransaction = {
            Type: amount >= 0 ? 'SPEND' : 'RECEIVE',
            Url: url,
            BankAccount: {
                AccountID: bankAccountId,
            },
            Contact: {
                ContactID: contactId,
            },
            Reference: reference,
            LineItems: [
                {
                    Description: description,
                    AccountCode: accountCode,
                    Quantity: 1,
                    UnitAmount: Math.abs(amount),
                },
            ],
        };

        const bankTrResponse = await this.xeroClient.bankTransactions.create(transaction);
        if (bankTrResponse.BankTransactions[0].StatusAttributeString === 'ERROR') {
            throw Error(JSON.stringify(bankTrResponse.BankTransactions[0].ValidationErrors, undefined, 2));
        }

        return bankTrResponse.BankTransactions[0].BankTransactionID!;
    }

    async billWithUrlExists(url: string): Promise<boolean> {
        const billsResponse = await this.xeroClient.invoices.get({ where: `Url="${this.escape(url)}" && Status!="DELETED"` });
        return billsResponse.Invoices.length > 0;
    }

    async createBill(contactId: string, description: string, currency: string, amount: number, accountCode: string, url: string): Promise<string> {
        await this.ensureCurrency(currency);
        const result = await this.xeroClient.invoices.create({
            Type: 'ACCPAY',
            Url: url,
            Contact: {
                ContactID: contactId,
            },
            CurrencyCode: currency,
            LineItems: [
                {
                    Description: description,
                    AccountCode: accountCode,
                    Quantity: 1,
                    UnitAmount: amount,
                },
            ],
        });

        if (result.Invoices[0].StatusAttributeString === 'ERROR') {
            throw Error(JSON.stringify(result.Invoices[0].ValidationErrors, undefined, 2));
        }

        return result.Invoices[0].InvoiceID!;
    }

    async uploadTransactionAttachment(transactionId: string, filePath: string, contentType: string) {
        await this.uploadAttachment(this.xeroClient.bankTransactions.attachments, transactionId, filePath, contentType);
    }

    async uploadBillAttachment(billId: string, filePath: string, contentType: string) {
        await this.uploadAttachment(this.xeroClient.invoices.attachments, billId, filePath, contentType);
    }

    private async uploadAttachment(attachmentsEndpoint: AttachmentsEndpoint, entityId: string, filePath: string, contentType: string) {
        const fileName = path.basename(filePath);
        await attachmentsEndpoint.uploadAttachment({
            entityId,
            fileName,
            mimeType: contentType,
            pathToUpload: filePath,
        });
    }

    private escape(val: string): string {
        return val.replace(/[\\$'"]/g, '\\$&');
    }

    private async ensureCurrency(currencyCode: string): Promise<void> {
        const currenciesResponse = await this.xeroClient.currencies.get({ where: `Code=="${this.escape(currencyCode)}"` });
        if (currenciesResponse.Currencies.length === 0) {
            await this.xeroClient.currencies.create({
                Code: currencyCode,
            });
        }
    }
}
