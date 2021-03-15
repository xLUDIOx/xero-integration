import { createReadStream } from 'fs';

import { Account, AccountType, Attachment, BankTransaction, Contact, Currency, CurrencyCode, Invoice, LineAmountTypes, Payment } from 'xero-node';

import { Intersection } from '@shared';
import { IDocumentSanitizer, ILogger, myriadthsToNumber, numberToMyriadths } from '@utils';

import { IXeroHttpClient, XeroEntityResponseType } from '../http';
import * as Accounting from './accounting';
import * as Auth from './auth';
import * as BankFeeds from './bank-feeds';
import {
    AccountingItemKeys,
    AccountKeys,
    BankAccountStatusCode,
    BankAccountType,
    BankTransactionStatusCode,
    ContactKeys,
    CurrencyKeys,
    IAccountingItemData,
    IAttachment,
    IBankAccount,
    IBankTransaction,
    IBillPaymentData,
    IClient,
    ICreateBillData,
    ICreateTransactionData,
    IInvoice,
    InvoiceStatusCode,
    IPayment,
    IUpdateBillData,
    IUpdateTransactionData,
} from './contracts';

export class Client implements IClient {
    constructor(
        readonly auth: Auth.IClient,
        readonly accounting: Accounting.IClient,
        readonly bankFeeds: BankFeeds.IClient,

        private readonly xeroClient: IXeroHttpClient,
        private readonly tenantId: string,
        private readonly documentSanitizer: IDocumentSanitizer,
        // @ts-ignore
        private readonly logger: ILogger,
    ) {
    }

    async findContact(name: string, vat?: string): Promise<Contact | undefined> {
        let contacts: Contact[] | undefined;

        if (vat) {
            const where = `${ContactKeys.taxNumber}=="${escapeParam(vat.trim())}"`;
            contacts = await this.xeroClient.makeClientRequest<Contact[]>(
                x => x.accountingApi.getContacts(this.tenantId, undefined, where),
                XeroEntityResponseType.Contacts
            );
        }

        if (!contacts || contacts.length === 0) {
            const where = `${ContactKeys.name}.toLower()=="${escapeParam(name.toLowerCase().trim())}"`;
            contacts = await this.xeroClient.makeClientRequest<Contact[]>(
                x => x.accountingApi.getContacts(this.tenantId, undefined, where),
                XeroEntityResponseType.Contacts,
            );
        }

        return contacts[0];
    }

    async getOrCreateContact(name: string, vat?: string): Promise<Contact> {
        const payload: Contact = {
            name: escapeParam(name),
        };

        if (vat) {
            payload.taxNumber = vat.trim();
        }

        let contacts: Contact[] | undefined;

        try {
            contacts = await this.xeroClient.makeClientRequest<Contact[]>(
                x => x.accountingApi.createContacts(this.tenantId, { contacts: [payload] }),
                XeroEntityResponseType.Contacts,
            );
        } catch (err) {
            if (err.message && err.message.includes('The contact name must be unique across all active contacts.')) {
                const existing = await this.findContact(name, vat);
                if (existing) {
                    return existing;
                }

                throw Error('Create contact failed with duplicate name, but could not find the contact');
            }

            throw err;
        }

        if (!contacts || contacts.length === 0) {
            throw Error('Failed to create contact');
        }

        return contacts[0];
    }

    async getBankAccounts(): Promise<IBankAccount[]> {
        const where = `${AccountKeys.status}=="${BankAccountStatusCode.Active}"&&${AccountKeys.type}=="${BankAccountType.Bank}"`;

        const result = await this.xeroClient.makeClientRequest<IBankAccount[]>(
            x => x.accountingApi.getAccounts(this.tenantId, undefined, where),
            XeroEntityResponseType.Accounts,
        );

        return result;
    }

    async getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined> {
        const bankAccounts = await this.xeroClient.makeClientRequest<IBankAccount[] | undefined>(
            x => x.accountingApi.getAccount(this.tenantId, bankAccountId),
            XeroEntityResponseType.Accounts,
        );

        return bankAccounts ? bankAccounts[0] : undefined;
    }

    async createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount> {
        const logger = this.logger.child({
            bankAccount: {
                name,
                code,
                accountNumber,
                currencyCode,
            },
        });

        if (!ALLOWED_CURRENCIES.includes(currencyCode)) {
            throw logger.error(Error('Tried to create bank account with invalid currency'));
        }

        await this.ensureCurrency(currencyCode);

        const bankAccounts = await this.xeroClient.makeClientRequest<IBankAccount[]>(
            x => x.accountingApi.createAccount(
                this.tenantId,
                {
                    name,
                    code,
                    type: AccountType.BANK,
                    bankAccountNumber: accountNumber,
                    bankAccountType: Account.BankAccountTypeEnum.CREDITCARD,
                    currencyCode: currencyCode as any,
                },
            ),
            XeroEntityResponseType.Accounts,
        );

        const bankAccount = bankAccounts[0];
        if (!bankAccount) {
            throw Error(`Could not create ${currencyCode} bank account`);
        }

        return bankAccount;
    }

    async getBankAccountByCodeOrName(code: string, name?: string): Promise<IBankAccount | undefined> {
        const accounts = await this.xeroClient.makeClientRequest<IBankAccount[]>(
            x => x.accountingApi.getAccounts(
                this.tenantId,
                undefined,
                `${AccountKeys.type}=="${AccountType.BANK}"`,
            ),
            XeroEntityResponseType.Accounts,
        );

        const account = accounts.find(a => a.code === code || a.name.toLowerCase() === name?.toLowerCase());
        return account;
    }

    async getTransactionByUrl(url: string): Promise<IBankTransaction | undefined> {
        const transactions = await this.xeroClient.makeClientRequest<IBankTransaction[] | undefined>(
            x => x.accountingApi.getBankTransactions(
                this.tenantId,
                undefined,
                `${AccountingItemKeys.url}="${escapeParam(url)}"&&${AccountingItemKeys.status}!="${BankTransactionStatusCode.Deleted}"`,
            ),
            XeroEntityResponseType.BankTransactions
        );

        const transaction = transactions ? transactions[0] : undefined;
        if (!transaction) {
            return undefined;
        }

        if (!transaction.bankTransactionID) {
            throw Error('Received a bank transaction without ID');
        }

        return transaction;
    }

    async createTransaction({ date, bankAccountId, contactId, description, reference, amount, fxFees, posFees, accountCode, feesAccountCode, taxType, url }: ICreateTransactionData): Promise<string> {
        const transaction = getBankTransactionModel(date, bankAccountId, contactId, description, reference, amount, fxFees, posFees, accountCode, feesAccountCode, taxType, url);

        const bankTransactions = await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.createBankTransactions(
                this.tenantId,
                { bankTransactions: [transaction] },
            ),
            XeroEntityResponseType.BankTransactions
        );

        const bankTransaction = bankTransactions[0];
        if (!bankTransaction || !bankTransaction.bankTransactionID) {
            throw Error('Failed to create bank transaction');
        }

        return bankTransaction.bankTransactionID;
    }

    async updateTransaction({ transactionId, date, bankAccountId, contactId, description, reference, amount, fxFees, posFees, accountCode, feesAccountCode, taxType, url }: IUpdateTransactionData): Promise<void> {
        const transaction = getBankTransactionModel(date, bankAccountId, contactId, description, reference, amount, fxFees, posFees, accountCode, feesAccountCode, taxType, url, transactionId);

        await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.updateBankTransaction(
                this.tenantId,
                transactionId,
                { bankTransactions: [transaction] },
            ),
            XeroEntityResponseType.BankTransactions
        );
    }

    async deleteTransaction(bankTransactionId: string): Promise<void> {
        await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.updateBankTransaction(
                this.tenantId,
                bankTransactionId,
                {
                    bankTransactions: [{
                        status: BankTransaction.StatusEnum.DELETED,
                    } as any],
                },
            ),
            XeroEntityResponseType.BankTransactions
        );
    }

    async getBillByUrl(url: string): Promise<IInvoice | undefined> {
        const where = `${AccountingItemKeys.url}="${escapeParam(url)}"&&${AccountingItemKeys.status}!="${InvoiceStatusCode.Deleted}"`;
        const invoices = await this.xeroClient.makeClientRequest<IInvoice[] | undefined>(
            x => x.accountingApi.getInvoices(this.tenantId, undefined, where),
            XeroEntityResponseType.Invoices
        );

        const invoice = invoices ? invoices[0] : undefined;
        if (!invoice) {
            return undefined;
        }

        if (!invoice.invoiceID) {
            throw Error('Received an invoice without ID');
        }

        return invoice;
    }

    async createBill(data: ICreateBillData): Promise<string> {
        const { date, dueDate, isPaid, contactId, description, currency, amount, accountCode, taxType, url } = data;

        await this.ensureCurrency(currency);

        const bill = getNewBillModel(date, contactId, description, currency, amount, accountCode, taxType, url, dueDate, isPaid);

        const invoices = await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.createInvoices(
                this.tenantId,
                { invoices: [bill] },
            ),
            XeroEntityResponseType.Invoices
        );

        const invoice = invoices[0];
        if (!invoice || !invoice.invoiceID) {
            throw Error('Failed to create invoice');
        }

        const billId = invoice.invoiceID;
        return billId;
    }

    async updateBill(data: IUpdateBillData): Promise<void> {
        const { billId, date, dueDate, isPaid, contactId, description, currency, amount, accountCode, taxType, url } = data;
        const billModel = getNewBillModel(date, contactId, description, currency, amount, accountCode, taxType, url, dueDate, isPaid, billId);

        await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.updateInvoice(
                this.tenantId,
                billId,
                { invoices: [billModel] },
            ),
            XeroEntityResponseType.Invoices
        );
    }

    async deleteBill(billId: string): Promise<void> {
        await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.updateInvoice(
                this.tenantId,
                billId,
                { invoices: [{ status: Invoice.StatusEnum.DELETED }] },
            ),
            XeroEntityResponseType.Invoices
        );
    }

    async uploadTransactionAttachment(transactionId: string, fileName: string, filePath: string, contentType: string) {
        await this.documentSanitizer.sanitize(filePath);

        const body = await getFileContents(filePath);

        await this.xeroClient.makeRawRequest<Attachment[]>(
            {
                path: `/BankTransactions/${encodeURIComponent(transactionId)}/Attachments/${encodeURIComponent(fileName)}`,
                method: 'PUT',
                body,
                contentType,
            },
            this.tenantId,
            XeroEntityResponseType.Attachments,
        );
    }

    async getTransactionAttachments(entityId: string): Promise<IAttachment[]> {
        const attachments = await this.xeroClient.makeRawRequest<IAttachment[]>(
            {
                method: 'GET',
                path: `/BankTransactions/${encodeURIComponent(entityId)}/Attachments`,
            },
            this.tenantId,
            XeroEntityResponseType.Attachments,
        );

        return attachments;
    }

    async uploadBillAttachment(billId: string, fileName: string, filePath: string, contentType: string) {
        await this.documentSanitizer.sanitize(filePath);

        const body = await getFileContents(filePath);

        await this.xeroClient.makeRawRequest(
            {
                path: `/Invoices/${encodeURIComponent(billId)}/Attachments/${encodeURIComponent(fileName)}`,
                method: 'PUT',
                body,
                contentType,
            },
            this.tenantId,
            XeroEntityResponseType.Attachments,
        );
    }

    async getBillAttachments(entityId: string): Promise<IAttachment[]> {
        const attachmentsResponse = await this.xeroClient.makeRawRequest<IAttachment[]>(
            {
                method: 'GET',
                path: `/Invoices/${encodeURIComponent(entityId)}/Attachments`,
            },
            this.tenantId,
            XeroEntityResponseType.Attachments,
        );

        return attachmentsResponse;
    }

    async payBill({ date, bankAccountId, amount, fxRate, billId }: IBillPaymentData): Promise<void> {
        const invoices = await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.getInvoice(
                this.tenantId,
                billId,
            ),
            XeroEntityResponseType.Invoices,
        );

        const invoice = invoices[0];
        if (!invoice) {
            throw Error('Bill not found');
        }

        const paymentModel = getNewPaymentModel(date, amount, bankAccountId, fxRate, billId);

        if (invoice.status === Invoice.StatusEnum.PAID) {
            this.logger.warn('Bill is already paid. Payment cannot be updated.');
            return;
        }

        const payments = await this.xeroClient.makeClientRequest<Payment[]>(
            x => x.accountingApi.createPayment(
                this.tenantId,
                paymentModel,
            ),
            XeroEntityResponseType.Payments,
        );

        const payment = payments[0];
        if (!payment) {
            throw Error('Failed to create payment');
        }
    }

    async getBillPayment(paymentId: string): Promise<IPayment | undefined> {
        const payments = await this.xeroClient.makeClientRequest<Payment[]>(
            x => x.accountingApi.getPayment(
                this.tenantId,
                paymentId,
            ),
            XeroEntityResponseType.Payments,
        );

        const payment = payments[0];
        return payment as IPayment;
    }

    private async ensureCurrency(currencyCode: string): Promise<void> {
        const currencies = await this.xeroClient.makeClientRequest<Currency[]>(
            x => x.accountingApi.getCurrencies(
                this.tenantId,
                `${CurrencyKeys.code}=="${escapeParam(currencyCode)}"`,
            ),
            XeroEntityResponseType.Currencies,
        );

        if (!currencies.length) {
            const createdCurrencies = await this.xeroClient.makeClientRequest<Currency[]>(
                x => x.accountingApi.createCurrency(
                    this.tenantId,
                    {
                        code: currencyCode as any,
                    },
                ),
                XeroEntityResponseType.Currencies,
            );

            if (!createdCurrencies || createdCurrencies.length === 0) {
                throw Error(`Could not create ${currencyCode} currency`);
            }
        }
    }
}

async function getFileContents(filePath: string): Promise<any[]> {
    const fileStream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
        const result: any[] = [];

        fileStream.on('data', chunk => result.push(chunk));
        fileStream.on('end', () => resolve(result));
        fileStream.on('error', err => reject(err));
    });
}

function getBankTransactionModel(date: string, bankAccountId: string, contactId: string, description: string, reference: string, amount: number, fxFees: number, posFees: number, accountCode: string, feesAccountCode: string, taxType: string | undefined, url: string, id?: string): BankTransaction {
    const commonData = getAccountingItemModel({ date, contactId, description, amount, fxFees, posFees, accountCode, feesAccountCode, taxType, url });
    const transaction: BankTransaction = {
        ...commonData,
        bankTransactionID: id,
        bankAccount: {
            accountID: bankAccountId,
        },
        reference,
        type: amount >= 0 ? BankTransaction.TypeEnum.SPEND : BankTransaction.TypeEnum.RECEIVE,
    };

    return transaction;
}

function getNewBillModel(date: string, contactId: string, description: string, currency: string, amount: number, accountCode: string, taxType: string | undefined, url: string, dueDate?: string, isPaid?: boolean, id?: string): Invoice {
    const commonData = getAccountingItemModel({ date, contactId, description, amount, accountCode, taxType, url });

    const bill: Invoice = {
        ...commonData,
        invoiceID: id,
        dueDate,
        type: Invoice.TypeEnum.ACCPAY,
        currencyCode: currency as any,

        // Xero default status
        status: Invoice.StatusEnum.DRAFT,
    };

    if (isPaid) {
        bill.status = Invoice.StatusEnum.AUTHORISED;
    }

    return bill;
}

function getAccountingItemModel({
    description,
    accountCode,
    amount,
    taxType,
    fxFees,
    posFees,
    feesAccountCode,
    date,
    url,
    contactId,
}: IAccountingItemData & Partial<Pick<ICreateTransactionData, 'posFees' | 'fxFees' | 'feesAccountCode'>>): Omit<Intersection<BankTransaction, Invoice>, 'type'> {
    const lineItems: IBankTransactionLineItem[] = [{
        description,
        accountCode,
        quantity: 1,
        unitAmount: Math.abs(amount),
        taxType,
    }];

    if (!!fxFees && !!posFees && feesAccountCode) {
        const feesDescription = fxFees !== 0 && posFees !== 0 ?
            'Exchange + POS fees' : fxFees !== 0 ?
                'Exchange fees' :
                'POS fees';

        lineItems.push({
            description: feesDescription,
            accountCode: feesAccountCode,
            quantity: 1,
            unitAmount: getFeesTotal(fxFees, posFees),
        });
    }

    return {
        date,
        url,
        contact: {
            contactID: contactId,
        },
        lineAmountTypes: LineAmountTypes.Inclusive,
        lineItems,
    };
}

function getNewPaymentModel(date: string, amount: number, bankAccountId: string, fxRate?: number, billId?: string): Payment {
    const paymentModel: Payment = {
        date,
        invoice: {
            invoiceID: billId,
        },
        account: {
            accountID: bankAccountId,
        },
        amount,
        currencyRate: fxRate,
    };

    return paymentModel;
}

export function escapeParam(val: string): string {
    const res = normalizeName(val)
        .replace(/[\\$']/g, '\\$&')
        ;
    return res.trim();
}

/*
    Removes double quotes and multiple whitespace
*/
export function normalizeName(name: string): string {
    const res = name
        .replace(/["]/g, '')
        .replace(/\s+/g, ' ');
    return res.trim();
}

function getFeesTotal(fxFees: number, posFees: number) {
    const result = myriadthsToNumber(
        (
            BigInt(numberToMyriadths(fxFees)) +
            BigInt(numberToMyriadths(posFees))
        ).toString()
    );

    return result;
}

const ALLOWED_CURRENCIES: string[] = [
    CurrencyCode.BGN.toString(),
    CurrencyCode.USD.toString(),
    CurrencyCode.EUR.toString(),
    CurrencyCode.GBP.toString(),
];

interface IBankTransactionLineItem {
    description: string;
    accountCode: string;
    quantity: number;
    unitAmount: number,
    taxType?: string;
}
