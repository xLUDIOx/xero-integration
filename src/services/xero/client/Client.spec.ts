import * as TypeMoq from 'typemoq';
import { AccountingAPIClient } from 'xero-node';

import { OperationNotAllowedError } from '../../../utils';
import { Client } from './Client';
import { BankTransactionType, ClientResponseStatus, CurrencyKeys, IBillPaymentData, ICreateBillData, ICreateTransactionData, InvoiceStatusCode, InvoiceType, LineAmountType } from './contracts';

const CURRENCY = 'GBP';

describe('Xero client', () => {
    const xeroClientMock = TypeMoq.Mock.ofType<AccountingAPIClient>();
    let bankTransactionsMock = TypeMoq.Mock.ofType<any>();
    let invoicesMock = TypeMoq.Mock.ofType<any>();
    let paymentsMock = TypeMoq.Mock.ofType<any>();
    let currenciesMock = TypeMoq.Mock.ofType<any>();

    const client = new Client(xeroClientMock.object, { sanitize: () => Promise.resolve() });

    beforeEach(() => {
        currenciesMock
            .setup(m => m.get({ where: `${CurrencyKeys.Code}=="${CURRENCY}"` }))
            .returns(async () => ({ Currencies: [{}] }));

        xeroClientMock.setup(x => x.bankTransactions).returns(() => bankTransactionsMock.object);
        xeroClientMock.setup(x => x.invoices).returns(() => invoicesMock.object);
        xeroClientMock.setup(x => x.payments).returns(() => paymentsMock.object);
        xeroClientMock.setup(x => x.currencies).returns(() => currenciesMock.object);
    });

    afterEach(() => {
        try {
            currenciesMock.verifyAll();
            invoicesMock.verifyAll();
            paymentsMock.verifyAll();
            bankTransactionsMock.verifyAll();
            xeroClientMock.verifyAll();
        } finally {
            invoicesMock = TypeMoq.Mock.ofType<any>();
            paymentsMock = TypeMoq.Mock.ofType<any>();
            currenciesMock = TypeMoq.Mock.ofType<any>();
            bankTransactionsMock = TypeMoq.Mock.ofType<any>();
            xeroClientMock.reset();
        }
    });

    describe('bank transactions', () => {
        it('should create spend bank transaction as tax inclusive with correct date string', async () => {
            const transaction = getSpendTransactionModel();

            const id = '1';

            bankTransactionsMock
                .setup(m => m.create({
                    BankTransactionID: undefined,
                    Type: BankTransactionType.Spend,
                    BankAccount: {
                        AccountID: transaction.bankAccountId,
                    },
                    Reference: transaction.reference,
                    DateString: transaction.date,
                    Url: transaction.url,
                    Contact: {
                        ContactID: transaction.contactId,
                    },
                    LineAmountTypes: LineAmountType.TaxInclusive,
                    LineItems: [
                        {
                            Description: transaction.description,
                            AccountCode: transaction.accountCode,
                            Quantity: 1,
                            UnitAmount: transaction.amount,
                        },
                    ],
                }))
                .returns(async () => {
                    return ({
                        BankTransactions: [
                            {
                                StatusAttributeString: ClientResponseStatus.Ok,
                                BankTransactionID: id,
                            },
                        ],
                    });
                })
                .verifiable(TypeMoq.Times.once());

            const transactionId = await client.createTransaction(transaction);
            expect(transactionId).toEqual(id);
        });

        it('should create receive bank transaction with correct amount', async () => {
            const transaction = getReceiveTransactionModel();

            const id = '1';

            bankTransactionsMock
                .setup(m => m.create({
                    BankTransactionID: undefined,
                    Type: BankTransactionType.Receive,
                    BankAccount: {
                        AccountID: transaction.bankAccountId,
                    },
                    Reference: transaction.reference,
                    DateString: transaction.date,
                    Url: transaction.url,
                    Contact: {
                        ContactID: transaction.contactId,
                    },
                    LineAmountTypes: LineAmountType.TaxInclusive,
                    LineItems: [
                        {
                            Description: transaction.description,
                            AccountCode: transaction.accountCode,
                            Quantity: 1,
                            UnitAmount: Math.abs(transaction.amount),
                        },
                    ],
                }))
                .returns(async () => {
                    return ({
                        BankTransactions: [
                            {
                                StatusAttributeString: ClientResponseStatus.Ok,
                                BankTransactionID: id,
                            },
                        ],
                    });
                })
                .verifiable(TypeMoq.Times.once());

            const transactionId = await client.createTransaction(transaction);
            expect(transactionId).toEqual(id);
        });

        it('should throw error', async () => {
            const transaction = getSpendTransactionModel();

            bankTransactionsMock
                .setup(m => m.create({
                    BankTransactionID: undefined,
                    Type: BankTransactionType.Spend,
                    BankAccount: {
                        AccountID: transaction.bankAccountId,
                    },
                    Reference: transaction.reference,
                    DateString: transaction.date,
                    Url: transaction.url,
                    Contact: {
                        ContactID: transaction.contactId,
                    },
                    LineAmountTypes: LineAmountType.TaxInclusive,
                    LineItems: [
                        {
                            Description: transaction.description,
                            AccountCode: transaction.accountCode,
                            Quantity: 1,
                            UnitAmount: transaction.amount,
                        },
                    ],
                }))
                .returns(async () => {
                    return ({
                        BankTransactions: [
                            {
                                StatusAttributeString: ClientResponseStatus.Error,
                                ValidationErrors: [
                                    {
                                        Message: 'Xero Error 1',
                                        Description: 'Something went wrong 1',
                                    },
                                    {
                                        Message: 'Xero Error 2',
                                        Description: 'Something went wrong 2',
                                    },
                                ],
                            },
                        ],
                    });
                })
                .verifiable(TypeMoq.Times.once());

            let error: Error | undefined;
            try {
                await client.createTransaction(transaction);
            } catch (err) {
                error = err;
            }

            if (!error) {
                fail('Request did not error');
            }

            expect(error.message).toContain('Xero Error 1');
            expect(error.message).toContain('Something went wrong 1');
            expect(error.message).toContain('Xero Error 2');
            expect(error.message).toContain('Something went wrong 2');
        });
    });

    describe('invoices', () => {
        it('should create spend invoice as tax inclusive with correct date and due date strings', async () => {
            const invoice = getBillModel();

            const id = '1';

            invoicesMock
                .setup(m => m.create({
                    InvoiceID: undefined,
                    DueDateString: invoice.dueDate,
                    Type: InvoiceType.AccountsPayable,
                    CurrencyCode: invoice.currency,
                    DateString: invoice.date,
                    Url: invoice.url,
                    Contact: {
                        ContactID: invoice.contactId,
                    },
                    LineAmountTypes: LineAmountType.TaxInclusive,
                    LineItems: [
                        {
                            Description: invoice.description,
                            AccountCode: invoice.accountCode,
                            Quantity: 1,
                            UnitAmount: invoice.amount,
                        },
                    ],
                }))
                .returns(async () => ({
                    Invoices: [
                        {
                            StatusAttributeString: ClientResponseStatus.Ok,
                            InvoiceID: id,
                        },
                    ],
                }))
                .verifiable(TypeMoq.Times.once());

            const invoiceId = await client.createBill(invoice);
            expect(invoiceId).toEqual(id);
        });

        it('should throw error if invoice is already paid', async () => {
            const invoice = getBillModel(true);

            const id = '1';

            invoicesMock
                .setup(m => m.get({
                    InvoiceID: id,
                }))
                .returns(async () => ({
                    Invoices: [
                        {
                            StatusAttributeString: ClientResponseStatus.Ok,
                            InvoiceID: id,
                            Status: InvoiceStatusCode.Paid,
                        },
                    ],
                }))
                .verifiable(TypeMoq.Times.once());

            await expect(client.updateBill({ ...invoice, billId: id })).rejects.toThrow(OperationNotAllowedError);
        });

        it('should throw error', async () => {
            const invoice = getBillModel();

            invoicesMock
                .setup(m => m.create({
                    InvoiceID: undefined,
                    DueDateString: invoice.dueDate,
                    Type: InvoiceType.AccountsPayable,
                    CurrencyCode: invoice.currency,
                    DateString: invoice.date,
                    Url: invoice.url,
                    Contact: {
                        ContactID: invoice.contactId,
                    },
                    LineAmountTypes: LineAmountType.TaxInclusive,
                    LineItems: [
                        {
                            Description: invoice.description,
                            AccountCode: invoice.accountCode,
                            Quantity: 1,
                            UnitAmount: invoice.amount,
                        },
                    ],
                }))
                .returns(async () => ({
                    Invoices: [
                        {
                            StatusAttributeString: ClientResponseStatus.Error,
                            ValidationErrors: [
                                {
                                    Message: 'Xero Error 1',
                                    Description: 'Something went wrong 1',
                                },
                                {
                                    Message: 'Xero Error 2',
                                    Description: 'Something went wrong 2',
                                },
                            ],
                        },
                    ],
                }))
                .verifiable(TypeMoq.Times.once());

            let error: Error | undefined;
            try {
                await client.createBill(invoice);
            } catch (err) {
                error = err;
            }

            if (!error) {
                fail('Request did not error');
            }

            expect(error.message).toContain('Xero Error 1');
            expect(error.message).toContain('Something went wrong 1');
            expect(error.message).toContain('Xero Error 2');
            expect(error.message).toContain('Something went wrong 2');
        });
    });

    describe('payments', () => {
        it('should create a payment if bill is not yet paid', async () => {
            const paymentDetails: IBillPaymentData = {
                date: new Date().toISOString(),
                billId: '1',
                amount: 100,
                currency: CURRENCY,
                fxRate: 1,
                bankAccountId: 'bank_id',
            };

            invoicesMock
                .setup(m => m.get({
                    InvoiceID: paymentDetails.billId,
                }))
                .returns(async () => ({
                    Invoices: [
                        {
                            StatusAttributeString: ClientResponseStatus.Ok,
                            InvoiceID: paymentDetails.billId,
                            Status: InvoiceStatusCode.Draft,
                        },
                    ],
                }))
                .verifiable(TypeMoq.Times.once());

            paymentsMock
                .setup(m => m.create({
                    Date: paymentDetails.date,
                    Invoice: {
                        InvoiceID: paymentDetails.billId,
                    },
                    Account: {
                        AccountID: paymentDetails.bankAccountId,
                    },
                    Amount: paymentDetails.amount,
                    CurrencyRate: paymentDetails.fxRate,
                }))
                .returns(async () => ({
                    Payments: [
                        {
                            StatusAttributeString: ClientResponseStatus.Ok,
                            PaymentID: '2',
                        },
                    ],
                }))
                .verifiable(TypeMoq.Times.once());

            await client.payBill(paymentDetails);
        });

        it('throws error if bill is already paid', async () => {
            const paymentDetails: IBillPaymentData = {
                date: new Date().toISOString(),
                billId: '1',
                amount: 100,
                currency: CURRENCY,
                bankAccountId: 'bank_id',
            };

            invoicesMock
                .setup(m => m.get({
                    InvoiceID: paymentDetails.billId,
                }))
                .returns(async () => ({
                    Invoices: [
                        {
                            StatusAttributeString: ClientResponseStatus.Ok,
                            InvoiceID: paymentDetails.billId,
                            Status: InvoiceStatusCode.Paid,
                        },
                    ],
                }))
                .verifiable(TypeMoq.Times.once());

            await expect(client.payBill(paymentDetails)).rejects.toThrow(OperationNotAllowedError);
        });
    });

    function getSpendTransactionModel(): ICreateTransactionData {
        const transaction: ICreateTransactionData = {
            date: new Date(2012, 10, 10).toISOString(),
            bankAccountId: 'bank-account-id',
            contactId: 'contact-id',
            description: 'expense note',
            reference: 'tx description',
            amount: 12.05,
            accountCode: '310',
            url: 'expense url',
        };

        return transaction;
    }

    function getReceiveTransactionModel(): ICreateTransactionData {
        const transaction: ICreateTransactionData = {
            date: new Date(2012, 10, 10).toISOString(),
            bankAccountId: 'bank-account-id',
            contactId: 'contact-id',
            description: 'expense note',
            reference: 'tx description',
            amount: -12.05,
            accountCode: '310',
            url: 'expense url',
        };

        return transaction;
    }

    function getBillModel(isPaid?: boolean): ICreateBillData {
        const bill: ICreateBillData = {
            date: new Date(2012, 10, 10).toISOString(),
            dueDate: new Date(2012, 10, 20).toISOString(),
            isPaid,
            contactId: 'contact-id',
            currency: CURRENCY,
            description: 'expense note',
            amount: 12.05,
            accountCode: '310',
            url: 'expense url',
        };

        return bill;
    }
});
