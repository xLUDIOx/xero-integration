import { AccountingAPIClient as XeroClient } from 'xero-node';
import { BankTransaction, Contact, Invoice, Organisation } from 'xero-node/lib/AccountingAPI-models';
import { ContactsResponse, SummariseErrors } from 'xero-node/lib/AccountingAPI-responses';

import { AttachmentsEndpoint } from 'xero-node/lib/AccountingAPIClient';
import { Intersection } from '../../utils';
import {
    AccountClassType,
    AccountingItemKeys,
    AccountType,
    BankAccountKeys,
    BankAccountStatusCode,
    BankAccountType,
    BankTransactionStatusCode,
    BankTransactionType,
    ClientResponseStatus,
    ContactKeys,
    CurrencyKeys,
    InvoiceStatusCode,
    InvoiceType,
    LineAmountType,
} from './ClientContracts';
import { IAccountCode } from './IAccountCode';
import { IAttachment } from './IAttachment';
import { IBankAccount } from './IBankAccount';
import { IClient, ICreateBillData, ICreateTransactionData, IUpdateBillData, IUpdateTransactionData } from './IClient';

export class Client implements IClient {
    constructor(private readonly xeroClient: XeroClient) {
    }

    async getOrganisation(): Promise<Organisation | undefined> {
        const organisationsResponse = await this.xeroClient.organisations.get();
        return organisationsResponse.Organisations[0];
    }

    async findContact(name: string, vat?: string): Promise<Contact | undefined> {
        let contactsResponse: ContactsResponse | undefined;
        if (vat) {
            contactsResponse = await this.xeroClient.contacts.get({ where: `${ContactKeys.TaxNumber}=="${this.escape(vat.trim())}"` });
        }

        if (!contactsResponse || contactsResponse.Contacts.length === 0) {
            const where = `${ContactKeys.Name}.toLower()=="${this.escape(name.toLowerCase().trim())}"`;
            contactsResponse = await this.xeroClient.contacts.get({ where });
        }

        const contact = contactsResponse.Contacts.length > 0 ? contactsResponse.Contacts[0] : undefined;
        return contact;
    }

    async createContact(name: string, vat?: string): Promise<Contact> {
        const payload: Contact = {
            Name: this.escapeDoubleQuotes(name.trim()),
        };

        if (vat) {
            payload.TaxNumber = vat.trim();
        }

        const contactsResponse = await this.xeroClient.contacts.create(payload);
        const contact = contactsResponse.Contacts[0];

        return this.handleClientResponse(contact);
    }

    async activateBankAccount(bankAccount: IBankAccount): Promise<IBankAccount> {
        const bankAccountsResponse = await this.xeroClient.accounts.update({ Status: BankAccountStatusCode.Active }, { AccountID: bankAccount.AccountID });
        const bankAccountResult = bankAccountsResponse.Accounts[0];

        return this.handleClientResponse(bankAccountResult);
    }

    async createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount> {
        await this.ensureCurrency(currencyCode);

        const bankAccountsResponse = await this.xeroClient.accounts.create({
            Name: name,
            Code: code,
            Type: AccountType.Bank,
            BankAccountNumber: accountNumber,
            BankAccountType: BankAccountType.CreditCard,
            CurrencyCode: currencyCode,
        });

        const bankAccountResult = bankAccountsResponse.Accounts[0];
        return this.handleClientResponse(bankAccountResult);
    }

    async getBankAccountByCode(code: string): Promise<IBankAccount | undefined> {
        const bankAccountsResponse = await this.xeroClient.accounts.get({
            where: `${BankAccountKeys.Type}=="${AccountType.Bank}" && ${BankAccountKeys.Code}=="${this.escape(code)}"`,
        });
        return bankAccountsResponse.Accounts.length > 0 ? bankAccountsResponse.Accounts[0] : undefined;
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        const accountsResponse = await this.xeroClient.accounts.get({ where: `Class=="${AccountClassType.Expense}"` });
        const xeroAccountCodes: IAccountCode[] = accountsResponse.Accounts;

        return xeroAccountCodes;
    }

    async getTransactionIdByUrl(url: string): Promise<string | undefined> {
        const transactionsResponse = await this.xeroClient.bankTransactions.get({
            where: `${AccountingItemKeys.Url}="${this.escape(url)}" && ${AccountingItemKeys.Status}!="${BankTransactionStatusCode.Deleted}"`,
        });

        return transactionsResponse.BankTransactions.length > 0 ? transactionsResponse.BankTransactions[0].BankTransactionID : undefined;
    }

    async createTransaction({ date, bankAccountId, contactId, description, reference, amount, accountCode, url }: ICreateTransactionData): Promise<string> {
        const transaction = this.getBankTransactionModel(date, bankAccountId, contactId, description, reference, amount, accountCode, url);

        const bankTrResponse = await this.xeroClient.bankTransactions.create(transaction);
        const bankTransaction = this.handleClientResponse(bankTrResponse.BankTransactions[0]);

        return bankTransaction.BankTransactionID!;
    }

    async updateTransaction({ transactionId, date, bankAccountId, contactId, description, reference, amount, accountCode, url }: IUpdateTransactionData): Promise<void> {
        const transaction = this.getBankTransactionModel(date, bankAccountId, contactId, description, reference, amount, accountCode, url, transactionId);

        const bankTrResponse = await this.xeroClient.bankTransactions.update(transaction);
        this.handleClientResponse(bankTrResponse.BankTransactions[0]);
    }

    async getBillIdByUrl(url: string): Promise<string | undefined> {
        const billsResponse = await this.xeroClient.invoices.get({
            where: `${AccountingItemKeys.Url}="${this.escape(url)}" && ${AccountingItemKeys.Status}!="${InvoiceStatusCode.Deleted}"`,
        });

        return billsResponse.Invoices.length > 0 ? billsResponse.Invoices[0].InvoiceID : undefined;
    }

    async createBill(data: ICreateBillData): Promise<string> {
        const { date, dueDate, contactId, description, currency, amount, accountCode, url } = data;
        await this.ensureCurrency(currency);

        const bill = this.getNewBillModel(date, contactId, description, currency, amount, accountCode, url, dueDate);
        const result = await this.xeroClient.invoices.create(bill);

        const billResult = this.handleClientResponse(result.Invoices[0]);
        return billResult.InvoiceID!;
    }

    async updateBill(data: IUpdateBillData): Promise<void> {
        const { billId, date, dueDate, contactId, description, currency, amount, accountCode, url } = data;
        const bill = await this.getNewBillModel(date, contactId, description, currency, amount, accountCode, url, dueDate, billId);
        const result = await this.xeroClient.invoices.update(bill);

        this.handleClientResponse(result.Invoices[0]);
    }

    async uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string) {
        await this.uploadAttachment(this.xeroClient.bankTransactions.attachments, transactionId, fileName, filePath, contentType);
    }

    async getTransactionAttachments(entityId: string): Promise<IAttachment[]> {
        const attachementsResponse = await this.xeroClient.bankTransactions.attachments.get({ entityId });
        return attachementsResponse.Attachments;
    }

    async uploadBillAttachment(billId: string, fileName: string, filePath: string, contentType: string) {
        await this.uploadAttachment(this.xeroClient.invoices.attachments, billId, fileName, filePath, contentType);
    }

    async getBillAttachments(entityId: string): Promise<IAttachment[]> {
        const attachementsResponse = await this.xeroClient.invoices.attachments.get({ entityId });
        return attachementsResponse.Attachments;
    }

    private getBankTransactionModel(date: string, bankAccountId: string, contactId: string, description: string, reference: string, amount: number, accountCode: string, url: string, id?: string): BankTransaction {
        const commonData = this.getAccountingItemModel(date, contactId, description, amount, accountCode, url);
        const transaction: BankTransaction = {
            BankTransactionID: id,
            Type: amount >= 0 ? BankTransactionType.Spend : BankTransactionType.Receive,
            BankAccount: {
                AccountID: bankAccountId,
            },
            Reference: reference,
            ...commonData,
        };

        return transaction;
    }

    private getNewBillModel(date: string, contactId: string, description: string, currency: string, amount: number, accountCode: string, url: string, dueDate?: string, id?: string): Invoice {
        const commonData = this.getAccountingItemModel(date, contactId, description, amount, accountCode, url);
        const bill: Invoice = {
            InvoiceID: id,
            DueDateString: dueDate,
            Type: InvoiceType.AccountsPayable,
            CurrencyCode: currency,
            ...commonData,
        };

        return bill;
    }

    private getAccountingItemModel(date: string, contactId: string, description: string, amount: number, accountCode: string, url: string): Intersection<BankTransaction, Invoice> {
        // Dates have the following form:
        //
        //      "DateString": "2014-05-26T00:00:00",
        //      "Date": "\/Date(1401062400000+0000)\/",
        //
        // Either is sufficient
        // Same applies for DueDate and DueDateString
        return {
            DateString: date,
            Url: url,
            Contact: {
                ContactID: contactId,
            },
            LineAmountTypes: LineAmountType.TaxInclusive,
            LineItems: [
                {
                    Description: description,
                    AccountCode: accountCode,
                    Quantity: 1,
                    UnitAmount: Math.abs(amount),
                },
            ],
        };
    }

    private async uploadAttachment(attachmentsEndpoint: AttachmentsEndpoint, entityId: string, fileName: string, filePath: string, contentType: string) {
        const attachmentsResponse = await attachmentsEndpoint.uploadAttachment({
            entityId,
            fileName,
            mimeType: contentType,
            pathToUpload: filePath,
        });

        this.handleClientResponse(attachmentsResponse.Attachments[0]);
    }

    private escape(val: string): string {
        const res = this.escapeDoubleQuotes(val)
            .replace(/[\\$']/g, '\\$&');
        return res;
    }

    private escapeDoubleQuotes(val: string): string {
        const res = val
            .replace(/["]/g, '');
        return res;
    }

    private async ensureCurrency(currencyCode: string): Promise<void> {
        const currenciesResponse = await this.xeroClient.currencies.get({ where: `${CurrencyKeys.Code}=="${this.escape(currencyCode)}"` });
        if (currenciesResponse.Currencies.length === 0) {
            const createCurrencyResponse = await this.xeroClient.currencies.create({
                Code: currencyCode,
            });

            this.handleClientResponse(createCurrencyResponse.Currencies[0]);
        }
    }

    private handleClientResponse<T>(clientResponse: T & SummariseErrors): T {
        if (clientResponse.StatusAttributeString === ClientResponseStatus.Error) {
            throw Error(JSON.stringify(clientResponse.ValidationErrors, undefined, 2));
        }

        return clientResponse;
    }
}
