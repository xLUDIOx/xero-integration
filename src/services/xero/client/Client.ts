import { createReadStream } from 'fs';

import { Account, AccountType, Attachment, BankTransaction, Contact, Currency, Invoice, LineAmountTypes, Payment } from 'xero-node';

import { ForbiddenError, IDocumentSanitizer, ILogger, Intersection, OperationNotAllowedError } from '../../../utils';
import { EntityResponseType, IXeroHttpClient } from '../http';
import {
    AccountClassType,
    AccountingItemKeys,
    AccountKeys,
    BankAccountStatusCode,
    BankAccountType,
    BankTransactionStatusCode,
    ContactKeys,
    CurrencyKeys,
    IAccountCode,
    IAttachment,
    IBankAccount,
    IBankTransaction,
    IBillPaymentData,
    IClient,
    ICreateBillData,
    ICreateTransactionData,
    IInvoice,
    INewAccountCode,
    InvoiceStatusCode,
    IOrganisation,
    ITenant,
    IUpdateBillData,
    IUpdateTransactionData,
} from './contracts';

export class Client implements IClient {
    constructor(
        private readonly xeroClient: IXeroHttpClient,
        private readonly tenantId: string,
        private readonly documentSanitizer: IDocumentSanitizer,
        // @ts-ignore
        private readonly logger: ILogger,
    ) {
    }

    async getOrganisation(): Promise<IOrganisation> {
        const tenants = await this.xeroClient.makeClientRequest<ITenant[]>(
            x => x.updateTenants(),
        );

        const tenant = tenants.find(t => t.id === this.tenantId);
        if (!tenant) {
            throw new ForbiddenError('Disconnected remotely');
        }

        const organisation = tenant.orgData;
        return organisation;
    }

    async findContact(name: string, vat?: string): Promise<Contact | undefined> {
        let contacts: Contact[] | undefined;

        if (vat) {
            const where = `${ContactKeys.taxNumber}=="${escapeParam(vat.trim())}"`;
            contacts = await this.xeroClient.makeClientRequest<Contact[]>(
                x => x.accountingApi.getContacts(this.tenantId, undefined, where),
                EntityResponseType.Contacts
            );
        }

        if (!contacts || contacts.length === 0) {
            const where = `${ContactKeys.name}.toLower()=="${escapeParam(name.toLowerCase().trim())}"`;
            contacts = await this.xeroClient.makeClientRequest<Contact[]>(
                x => x.accountingApi.getContacts(this.tenantId, undefined, where),
                EntityResponseType.Contacts,
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
                EntityResponseType.Contacts,
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
            EntityResponseType.Accounts,
        );

        return result;
    }

    async getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined> {
        const bankAccounts = await this.xeroClient.makeClientRequest<IBankAccount[] | undefined>(
            x => x.accountingApi.getAccount(this.tenantId, bankAccountId),
            EntityResponseType.Accounts,
        );

        return bankAccounts ? bankAccounts[0] : undefined;
    }

    async activateBankAccount(bankAccountId: string): Promise<IBankAccount> {
        const bankAccountsResult = await this.xeroClient.makeClientRequest<IBankAccount[]>(
            x => x.accountingApi.updateAccount(
                this.tenantId,
                bankAccountId,
                {
                    accounts: [{ status: Account.StatusEnum.ACTIVE }],
                },
            ),
            EntityResponseType.Accounts,
        );

        const bankAccount = bankAccountsResult[0];
        if (!bankAccount) {
            throw Error('Could not activate bank account');
        }

        return bankAccount;
    }

    async createBankAccount(name: string, code: string, accountNumber: string, currencyCode: string): Promise<IBankAccount> {
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
            EntityResponseType.Accounts,
        );

        const bankAccount = bankAccounts[0];
        if (!bankAccount) {
            throw Error(`Could not create ${currencyCode} bank account`);
        }

        return bankAccount;
    }

    async getBankAccountByCode(code: string): Promise<IBankAccount | undefined> {
        const accounts = await this.xeroClient.makeClientRequest<IBankAccount[]>(
            x => x.accountingApi.getAccounts(
                this.tenantId,
                undefined,
                `${AccountKeys.type}=="${AccountType.BANK}" && ${AccountKeys.code}=="${escapeParam(code)}"`,
            ),
            EntityResponseType.Accounts,
        );

        return accounts[0];
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        const expenseAccounts = await this.xeroClient.makeClientRequest<IAccountCode[]>(
            x => x.accountingApi.getAccounts(
                this.tenantId,
                undefined,
                `Class=="${AccountClassType.Expense}"`,
            ),
            EntityResponseType.Accounts,
        );

        return expenseAccounts;
    }

    async getOrCreateExpenseAccount({ name, code, addToWatchlist }: INewAccountCode): Promise<IAccountCode> {
        let expenseAccount = (await this.getExpenseAccounts()).find(x => x.code === code);
        if (!expenseAccount) {
            const expenseAccountModel: Account = {
                name,
                code,
                type: AccountType.EXPENSE,
            };

            const createResult = await this.xeroClient.makeClientRequest<IAccountCode[]>(
                x => x.accountingApi.createAccount(
                    this.tenantId,
                    expenseAccountModel,
                ),
                EntityResponseType.Accounts,
            );

            if (createResult.length === 0) {
                throw Error(`Did not create expense account: ${name} - ${code}`);
            }

            expenseAccount = createResult[0];
        }

        if (addToWatchlist && !expenseAccount.addToWatchlist) {
            // Adding to watchlist can be executed only in update request
            const updateResult = await this.xeroClient.makeClientRequest<IAccountCode[]>(
                x => x.accountingApi.updateAccount(
                    this.tenantId,
                    expenseAccount!.accountID,
                    {
                        accounts: [{
                            addToWatchlist: true,
                        }],
                    }
                ),
                EntityResponseType.Accounts,
            );

            if (updateResult.length === 0) {
                this.logger.error(Error('Unable to add expense code to watchlist'));
            }
        }

        return expenseAccount;
    }

    async getTransactionByUrl(url: string): Promise<IBankTransaction | undefined> {
        const transactions = await this.xeroClient.makeClientRequest<IBankTransaction[] | undefined>(
            x => x.accountingApi.getBankTransactions(
                this.tenantId,
                undefined,
                `${AccountingItemKeys.url}="${escapeParam(url)}" && ${AccountingItemKeys.status}!="${BankTransactionStatusCode.Deleted}"`,
            ),
            EntityResponseType.BankTransactions
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

    async createTransaction({ date, bankAccountId, contactId, description, reference, amount, accountCode, url }: ICreateTransactionData): Promise<string> {
        const transaction = getBankTransactionModel(date, bankAccountId, contactId, description, reference, amount, accountCode, url);

        const bankTransactions = await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.createBankTransactions(
                this.tenantId,
                { bankTransactions: [transaction] },
            ),
            EntityResponseType.BankTransactions
        );

        const bankTransaction = bankTransactions[0];
        if (!bankTransaction || !bankTransaction.bankTransactionID) {
            throw Error('Failed to create bank transaction');
        }

        return bankTransaction.bankTransactionID;
    }

    async updateTransaction({ transactionId, date, bankAccountId, contactId, description, reference, amount, accountCode, url }: IUpdateTransactionData): Promise<void> {
        const transaction = getBankTransactionModel(date, bankAccountId, contactId, description, reference, amount, accountCode, url, transactionId);

        await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.updateBankTransaction(
                this.tenantId,
                transactionId,
                { bankTransactions: [transaction] },
            ),
            EntityResponseType.BankTransactions
        );
    }

    async getBillByUrl(url: string): Promise<IInvoice | undefined> {
        const where = `${AccountingItemKeys.url}="${escapeParam(url)}" && ${AccountingItemKeys.status}!="${InvoiceStatusCode.Deleted}"`;
        const invoices = await this.xeroClient.makeClientRequest<IInvoice[] | undefined>(
            x => x.accountingApi.getInvoices(this.tenantId, undefined, where),
            EntityResponseType.Invoices
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
        const { date, dueDate, isPaid, contactId, description, currency, amount, accountCode, url } = data;
        await this.ensureCurrency(currency);

        const bill = getNewBillModel(date, contactId, description, currency, amount, accountCode, url, dueDate, isPaid);

        const invoices = await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.createInvoices(
                this.tenantId,
                { invoices: [bill] },
            ),
            EntityResponseType.Invoices
        );

        const invoice = invoices[0];
        if (!invoice || !invoice.invoiceID) {
            throw Error('Failed to create invoice');
        }

        const billId = invoice.invoiceID;
        return billId;
    }

    async updateBill(data: IUpdateBillData, existingBill: IInvoice): Promise<void> {
        const { billId, date, dueDate, isPaid, contactId, description, currency, amount, accountCode, url } = data;
        const billModel = getNewBillModel(date, contactId, description, currency, amount, accountCode, url, dueDate, isPaid, billId);

        if (isPaid && existingBill.status === Invoice.StatusEnum.PAID) {
            throw new OperationNotAllowedError('Bill is already paid. It cannot be updated.');
        }

        await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.updateInvoice(
                this.tenantId,
                billId,
                { invoices: [billModel] },
            ),
            EntityResponseType.Invoices
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
            EntityResponseType.Attachments,
        );
    }

    async getTransactionAttachments(entityId: string): Promise<IAttachment[]> {
        const attachments = await this.xeroClient.makeRawRequest<Attachment[]>(
            {
                method: 'GET',
                path: `/BankTransactions/${encodeURIComponent(entityId)}/Attachments`,
            },
            this.tenantId,
            EntityResponseType.Attachments,
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
            EntityResponseType.Attachments,
        );
    }

    async getBillAttachments(entityId: string): Promise<IAttachment[]> {
        const attachmentsResponse = await this.xeroClient.makeRawRequest<Attachment[]>(
            {
                method: 'GET',
                path: `/Invoices/${encodeURIComponent(entityId)}/Attachments`,
            },
            this.tenantId,
            EntityResponseType.Attachments,
        );

        return attachmentsResponse;
    }

    async payBill({ date, bankAccountId, amount, fxRate, billId }: IBillPaymentData): Promise<void> {
        const invoices = await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.getInvoice(
                this.tenantId,
                billId,
            ),
            EntityResponseType.Invoices,
        );

        const invoice = invoices[0];
        if (!invoice) {
            throw Error('Bill not found');
        }

        const paymentModel = getNewPaymentModel(date, amount, bankAccountId, fxRate, billId);

        if (invoice.status === Invoice.StatusEnum.PAID) {
            throw new OperationNotAllowedError('Bill is already paid. Payment cannot be updated.');
        }

        const payments = await this.xeroClient.makeClientRequest<Payment[]>(
            x => x.accountingApi.createPayment(
                this.tenantId,
                paymentModel,
            ),
            EntityResponseType.Payments,
        );

        const payment = payments[0];
        if (!payment) {
            throw Error('Failed to create payment');
        }
    }

    private async ensureCurrency(currencyCode: string): Promise<void> {
        const currencies = await this.xeroClient.makeClientRequest<Currency[]>(
            x => x.accountingApi.getCurrencies(
                this.tenantId,
                `${CurrencyKeys.code}=="${escapeParam(currencyCode)}"`,
            ),
            EntityResponseType.Currencies,
        );

        if (!currencies.length) {
            const createdCurrencies = await this.xeroClient.makeClientRequest<Currency[]>(
                x => x.accountingApi.createCurrency(
                    this.tenantId,
                    {
                        code: currencyCode as any,
                    },
                ),
                EntityResponseType.Currencies,
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

function getBankTransactionModel(date: string, bankAccountId: string, contactId: string, description: string, reference: string, amount: number, accountCode: string, url: string, id?: string): BankTransaction {
    const commonData = getAccountingItemModel(date, contactId, description, amount, accountCode, url);
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

function getNewBillModel(date: string, contactId: string, description: string, currency: string, amount: number, accountCode: string, url: string, dueDate?: string, isPaid?: boolean, id?: string): Invoice {
    const commonData = getAccountingItemModel(date, contactId, description, amount, accountCode, url);

    const bill: Invoice = {
        ...commonData,
        invoiceID: id,
        dueDate,
        type: Invoice.TypeEnum.ACCPAY,
        currencyCode: currency as any,
    };

    if (isPaid) {
        bill.status = Invoice.StatusEnum.AUTHORISED;
    }

    return bill;
}

function getAccountingItemModel(date: string, contactId: string, description: string, amount: number, accountCode: string, url: string): Omit<Intersection<BankTransaction, Invoice>, 'type'> {
    return {
        date,
        url,
        contact: {
            contactID: contactId,
        },
        lineAmountTypes: LineAmountTypes.Inclusive,
        lineItems: [
            {
                description,
                accountCode,
                quantity: 1,
                unitAmount: Math.abs(amount),
            },
        ],
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
