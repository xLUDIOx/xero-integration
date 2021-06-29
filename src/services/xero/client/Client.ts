import { createReadStream } from 'fs';

import { Account, AccountType, Attachment, BankTransaction, Contact, CreditNote, Currency, CurrencyCode, Invoice, LineAmountTypes, LineItem, Payment } from 'xero-node';

import { ExcludeStrict, FEES_ACCOUNT_CODE, Intersection, Optional, PartialBy, RequiredNonNullBy } from '@shared';
import { IDocumentSanitizer, ILogger, sum, TRACKING_CATEGORIES_MISMATCH_ERROR_MESSAGE } from '@utils';

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
    IClient,
    ICreateBillData,
    ICreateTransactionData,
    ICreditNote,
    ICreditNoteData,
    IInvoice,
    InvoiceStatusCode,
    IPayment,
    IPaymentData,
    ITrackingCategoryValue,
    IUpdateBillData,
    IUpdateTransactionData,
    PaymentItemType,
} from './contracts';

export class Client implements IClient {
    constructor(
        readonly auth: Auth.IClient,
        readonly accounting: Accounting.IClient,
        readonly bankFeeds: BankFeeds.IClient,

        private readonly xeroClient: IXeroHttpClient,
        private readonly tenantId: string,
        private readonly documentSanitizer: IDocumentSanitizer,
        private readonly logger: ILogger,
    ) {
    }

    async findContact(name: string, vat?: string, email?: string): Promise<Contact | undefined> {
        let contacts: Contact[] | undefined;

        if (vat) {
            const where = `${ContactKeys.taxNumber}=="${escapeParam(vat.trim())}"`;
            contacts = await this.xeroClient.makeClientRequest<Contact[]>(
                x => x.accountingApi.getContacts(this.tenantId, undefined, where),
                XeroEntityResponseType.Contacts
            );
        }

        if ((!contacts || contacts.length === 0) && email) {
            const where = `${ContactKeys.emailAddress}=="${escapeParam(email.toLowerCase().trim())}"`;
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

        return contacts && contacts.length > 0 ? contacts[0] : undefined;
    }

    async getOrCreateContact(name: string, vat?: string, email?: string): Promise<Contact> {
        const payload: Contact = {
            name: escapeParam(name),
        };

        if (vat) {
            payload.taxNumber = vat.trim();
        }

        if (email) {
            payload.emailAddress = email.toLowerCase().trim();
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

        return result ?? [];
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

        const bankAccount = bankAccounts && bankAccounts.length > 0 ? bankAccounts[0] : undefined;
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

        const account = accounts ? accounts.find(a => a.code === code || a.name.toLowerCase() === name?.toLowerCase()) : undefined;
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

    async createTransaction(data: ICreateTransactionData): Promise<string> {
        const transactionModel = getBankTransactionModel(data);

        const bankTransactions = await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.createBankTransactions(
                this.tenantId,
                { bankTransactions: [transactionModel] },
            ),
            XeroEntityResponseType.BankTransactions
        );

        const bankTransaction = bankTransactions && bankTransactions.length > 0 ? bankTransactions[0] : undefined;
        if (!bankTransaction || !bankTransaction.bankTransactionID) {
            throw Error('Failed to create bank transaction');
        }

        const logger = this.logger.child({ bankTransactionId: bankTransaction.bankTransactionID, url: data.url });

        ensureTrackingCategoriesAreApplied(
            transactionModel.lineItems,
            bankTransaction.lineItems,
            logger,
        );

        return bankTransaction.bankTransactionID;
    }

    async updateTransaction(data: IUpdateTransactionData): Promise<void> {
        const transaction = getBankTransactionModel(data);

        const bankTransactions = await this.xeroClient.makeClientRequest<IBankTransaction[]>(
            x => x.accountingApi.updateBankTransaction(
                this.tenantId,
                data.transactionId,
                { bankTransactions: [transaction] },
            ),
            XeroEntityResponseType.BankTransactions
        );

        let logger = this.logger.child({ url: data.url });
        const errorMessage = 'No updated transaction after update';
        if (!bankTransactions || !bankTransactions.length) {
            logger.error(Error(errorMessage));
            return;
        }

        const bankTransaction = bankTransactions[0];
        logger = logger.child({ xeroBankTransactionId: bankTransaction.bankTransactionID });
        if (!bankTransaction || !bankTransaction.bankTransactionID) {
            logger.error(Error(errorMessage));
            return;
        }

        ensureTrackingCategoriesAreApplied(
            transaction.lineItems,
            bankTransaction.lineItems,
            logger,
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

    async getBillById(billId: string): Promise<IInvoice | undefined> {
        const invoices = await this.xeroClient.makeClientRequest<IInvoice[] | undefined>(
            x => x.accountingApi.getInvoice(this.tenantId, billId),
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
        await this.ensureCurrency(data.currency);

        const bill = getNewBillModel(data);

        const invoices = await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.createInvoices(
                this.tenantId,
                { invoices: [bill] },
            ),
            XeroEntityResponseType.Invoices
        );

        const invoice = invoices && invoices.length > 0 ? invoices[0] : undefined;
        if (!invoice || !invoice.invoiceID) {
            throw Error('Failed to create invoice');
        }

        const logger = this.logger.child({ bankTransactionId: invoice.invoiceID, url: data.url });
        ensureTrackingCategoriesAreApplied(
            bill.lineItems,
            invoice.lineItems,
            logger,
        );

        const billId = invoice.invoiceID;
        return billId;
    }

    async updateBill(data: IUpdateBillData): Promise<void> {
        const billModel = getNewBillModel(data, data.billId);

        const invoices = await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.updateInvoice(
                this.tenantId,
                data.billId,
                { invoices: [billModel] },
            ),
            XeroEntityResponseType.Invoices
        );

        let logger = this.logger.child({ url: data.url });
        const errorMessage = 'No updated bill after update';
        if (!invoices || !invoices.length) {
            logger.error(Error(errorMessage));
            return;
        }

        const invoice = invoices[0];
        logger = logger.child({ xeroInvoiceId: invoice.invoiceID });
        if (!invoice || !invoice.invoiceID) {
            logger.error(Error(errorMessage));
            return;
        }

        ensureTrackingCategoriesAreApplied(
            billModel.lineItems,
            invoice.lineItems,
            logger,
        );
    }

    async deleteBill(billId: string): Promise<void> {
        await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.updateInvoice(
                this.tenantId,
                billId,
                { invoices: [{ status: Invoice.StatusEnum.VOIDED }] },
            ),
            XeroEntityResponseType.Invoices
        );
    }

    async getCreditNoteByNumber(creditNoteNumber: string): Promise<ICreditNote | undefined> {
        const creditNotes = await this.xeroClient.makeClientRequest<ICreditNote[] | undefined>(
            x => x.accountingApi.getCreditNote(this.tenantId, creditNoteNumber),
            XeroEntityResponseType.CreditNotes,
        );

        const creditNote = creditNotes ? creditNotes[0] : undefined;
        if (!creditNote) {
            return undefined;
        }

        if (!creditNote.creditNoteID) {
            throw Error('Received a credit note without ID');
        }

        return creditNote;
    }

    async createCreditNote(data: ICreditNoteData): Promise<string> {
        await this.ensureCurrency(data.currency);

        const creditNoteModel = getNewCreditNoteModel(data);

        const creditNotes = await this.xeroClient.makeClientRequest<ICreditNote[]>(
            x => x.accountingApi.createCreditNotes(
                this.tenantId,
                { creditNotes: [creditNoteModel] },
            ),
            XeroEntityResponseType.CreditNotes
        );

        const creditNote = creditNotes ? creditNotes[0] : undefined;
        if (!creditNote || !creditNote.creditNoteID) {
            throw Error('Failed to create credit note');
        }

        const logger = this.logger.child({ creditNoteNumber: creditNote.creditNoteNumber });

        ensureTrackingCategoriesAreApplied(
            creditNote.lineItems,
            creditNote.lineItems,
            logger,
        );

        const billId = creditNote.creditNoteID;
        return billId;
    }

    async updateCreditNote(data: ICreditNoteData): Promise<void> {
        const creditNoteModel = getNewCreditNoteModel(data);

        const creditNotes = await this.xeroClient.makeClientRequest<CreditNote[]>(
            x => x.accountingApi.updateCreditNote(
                this.tenantId,
                data.creditNoteNumber,
                { creditNotes: [creditNoteModel] },
            ),
            XeroEntityResponseType.CreditNotes
        );

        let logger = this.logger.child({ creditNoteNumber: data.creditNoteNumber });
        const errorMessage = 'No updated credit note after update';
        if (!creditNotes || !creditNotes.length) {
            logger.error(Error(errorMessage));
            return;
        }

        const creditNote = creditNotes[0];
        logger = logger.child({ creditNoteNumber: creditNote.creditNoteNumber });
        if (!creditNote || !creditNote.creditNoteID) {
            logger.error(Error(errorMessage));
            return;
        }

        ensureTrackingCategoriesAreApplied(
            creditNoteModel.lineItems,
            creditNote.lineItems,
            logger,
        );
    }

    async deleteCreditNote(creditNoteId: string): Promise<void> {
        await this.xeroClient.makeClientRequest<Invoice[]>(
            x => x.accountingApi.updateCreditNote(
                this.tenantId,
                creditNoteId,
                { creditNotes: [{ status: CreditNote.StatusEnum.VOIDED }] },
            ),
            XeroEntityResponseType.CreditNotes
        );
    }

    async uploadCreditNoteAttachment(creditNoteId: string, fileName: string, filePath: string, contentType: string) {
        await this.documentSanitizer.sanitize(filePath);

        const body = await getFileContents(filePath);

        await this.xeroClient.makeRawRequest<Attachment[]>(
            {
                path: `/CreditNotes/${encodeURIComponent(creditNoteId)}/Attachments/${encodeURIComponent(fileName)}`,
                method: 'PUT',
                body,
                contentType,
            },
            this.tenantId,
            XeroEntityResponseType.Attachments,
        );
    }

    async getCreditNoteAttachments(creditNoteId: string): Promise<IAttachment[]> {
        const attachments = await this.xeroClient.makeRawRequest<IAttachment[]>(
            {
                method: 'GET',
                path: `/CreditNotes/${encodeURIComponent(creditNoteId)}/Attachments`,
            },
            this.tenantId,
            XeroEntityResponseType.Attachments,
        );

        return attachments ?? [];
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

        return attachments ?? [];
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

        return attachmentsResponse ?? [];
    }

    async createPayment(data: IPaymentData): Promise<void> {
        const paymentModel = getNewPaymentModel(data);

        const payments = await this.xeroClient.makeClientRequest<Payment[]>(
            x => x.accountingApi.createPayment(
                this.tenantId,
                paymentModel,
            ),
            XeroEntityResponseType.Payments,
        );

        const payment = payments && payments.length > 0 ? payments[0] : undefined;
        if (!payment) {
            throw Error('Failed to create payment');
        }
    }

    async getPayment(paymentId: string): Promise<IPayment | undefined> {
        const payments = await this.xeroClient.makeClientRequest<Payment[]>(
            x => x.accountingApi.getPayment(
                this.tenantId,
                paymentId,
            ),
            XeroEntityResponseType.Payments,
        );

        const payment = payments && payments.length > 0 ? payments[0] : undefined;
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

        if (!currencies || !currencies.length) {
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

function getBankTransactionModel(data: ICreateTransactionData, id?: string): BankTransaction {
    const commonData = getAccountingItemModel(data);
    const transaction: BankTransaction = {
        ...commonData,
        bankTransactionID: id,
        bankAccount: {
            accountID: data.bankAccountId,
        },
        type: data.amount >= 0 ? BankTransaction.TypeEnum.SPEND : BankTransaction.TypeEnum.RECEIVE,
    };

    return transaction;
}

function getNewBillModel(data: ICreateBillData, id?: string): Invoice {
    const commonData = getAccountingItemModel(data);

    const bill: Invoice = {
        ...commonData,
        invoiceID: id,
        invoiceNumber: data.reference,
        dueDate: data.dueDate,
        type: Invoice.TypeEnum.ACCPAY,
        currencyCode: data.currency as any,
        status: Invoice.StatusEnum.AUTHORISED,
    };

    return bill;
}

function getNewCreditNoteModel(data: ICreditNoteData): CreditNote {
    const commonData = getAccountingItemModel(data);

    const bill: CreditNote = {
        ...commonData,
        creditNoteNumber: data.creditNoteNumber,
        type: CreditNote.TypeEnum.ACCPAYCREDIT,
        currencyCode: data.currency as any,
        status: Invoice.StatusEnum.AUTHORISED,
        reference: data.reference,
    };

    return bill;
}

export function getAccountingItemModel({
    description,
    reference,
    bankFees = 0,
    fxFees = 0,
    posFees = 0,
    feesAccountCode,
    date,
    url,
    contactId,
    lineItems = [],
}: PartialBy<IAccountingItemData, 'url' | 'reference'> &
    Partial<Pick<ICreateTransactionData, 'posFees' | 'fxFees' | 'feesAccountCode'>> &
    Partial<Pick<ICreateBillData, 'bankFees' | 'feesAccountCode'>>
): Omit<Intersection<BankTransaction, Invoice>, 'type'> {
    const items: ILineItem[] = lineItems.map(l => ({
        description,
        accountCode: l.accountCode,
        quantity: 1,
        unitAmount: l.amount,
        taxType: l.taxType,
        tracking: toTrackingCategory(l.trackingCategories),
    }));

    const feesTotal = sum(bankFees, posFees, fxFees);

    if (feesAccountCode && feesTotal > 0) {
        const feesDescription = bankFees ?
            'Bank transfer fees' :
            fxFees !== 0 && posFees !== 0 ?
                'Exchange + POS fees' : fxFees !== 0 ?
                    'Exchange fees' :
                    'POS fees';

        items.push({
            description: feesDescription,
            accountCode: feesAccountCode,
            quantity: 1,
            unitAmount: feesTotal,
        });
    }

    return {
        date,
        reference,
        url,
        contact: {
            contactID: contactId,
        },
        lineAmountTypes: LineAmountTypes.Inclusive,
        lineItems: items,
    };
}

function ensureTrackingCategoriesAreApplied(sentLineItems: LineItem[] = [], returnedLineItems: LineItem[] = [], logger: ILogger) {
    for (const sentLineItem of sentLineItems) {
        if (sentLineItem.accountCode === FEES_ACCOUNT_CODE) {
            continue;
        }

        let returnedLineItem: Optional<LineItem>;
        if (sentLineItem.lineItemID) {
            returnedLineItem = returnedLineItems.find(ln => ln.lineItemID === sentLineItem.lineItemID);
        } else if (sentLineItem.description) {
            returnedLineItem = returnedLineItems.find(ln => ln.description?.trim() === sentLineItem.description?.trim());
        }

        if (!returnedLineItem) {
            logger.error(Error(`Couldn't find matching line item in response`), { lineItemsSend: sentLineItems, lineItemsReturned: returnedLineItems });
            break;
        }

        if (sentLineItem.tracking && sentLineItem.tracking.length) {
            if (sentLineItem.tracking.length !== returnedLineItem.tracking?.length ?? 0) {
                logger.info({ trackingCategoriesSend: sentLineItem.tracking, trackingCategoriesReturned: returnedLineItem.tracking ?? [] }, TRACKING_CATEGORIES_MISMATCH_ERROR_MESSAGE);
                break;
            }
        }
    }
}

function toTrackingCategory(trackingCategories?: ITrackingCategoryValue[]) {
    return trackingCategories?.map(m => ({ trackingCategoryID: m.categoryId, trackingOptionID: m.valueId }));
}

function getNewPaymentModel({ date, itemId, itemType, bankAccountId, amount, fxRate }: IPaymentData): Payment {
    const paymentModel: Payment = {
        date,
        account: {
            accountID: bankAccountId,
        },
        amount,
        currencyRate: fxRate,
    };

    if (itemType === PaymentItemType.CreditNote) {
        paymentModel.creditNote = {
            creditNoteID: itemId,
        };
    } else if (itemType === PaymentItemType.Invoice) {
        paymentModel.invoice = {
            invoiceID: itemId,
        };
    }

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

const ALLOWED_CURRENCIES: string[] = [
    CurrencyCode.BGN.toString(),
    CurrencyCode.USD.toString(),
    CurrencyCode.EUR.toString(),
    CurrencyCode.GBP.toString(),
];

type LineItemSelectedFields = 'description' | 'accountCode' | 'quantity' | 'unitAmount' | 'taxType' | 'tracking';
type ILineItem = Pick<RequiredNonNullBy<LineItem, ExcludeStrict<LineItemSelectedFields, 'taxType' | 'tracking'>>, LineItemSelectedFields>;
