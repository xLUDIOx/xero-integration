import * as TypeMoq from 'typemoq';
import { AccountingApi, Invoice, XeroClient } from 'xero-node';

import { FEES_ACCOUNT_CODE } from '@shared';
import { typeIsEqualSkipUndefined } from '@test-utils';
import { ILogger, Lock } from '@utils';

import { createXeroHttpClient } from '../http';
import * as AccountingClient from './accounting';
import * as AuthClient from './auth';
import * as BankFeedsClient from './bank-feeds';
import { Client, escapeParam, getAccountingItemModel } from './Client';
import { BankTransactionType, ClientResponseStatus, CurrencyKeys, ICreateBillData, ICreateTransactionData, InvoiceType, IPaymentData, LineAmountType, PaymentItemType } from './contracts';

const CURRENCY = 'GBP';

describe.only('Xero client', () => {
    const authClientMock = TypeMoq.Mock.ofType<AuthClient.IClient>();
    const accountingClientMock = TypeMoq.Mock.ofType<AccountingClient.IClient>();
    const bankFeedsClientMock = TypeMoq.Mock.ofType<BankFeedsClient.IClient>();
    const xeroClientMock = TypeMoq.Mock.ofType<AccountingApi>();
    const loggerMock = TypeMoq.Mock.ofType<ILogger>();
    const tenantId = '00000000-0000-0000-0000-000000000000';

    const client = new Client(
        authClientMock.object,
        accountingClientMock.object,
        bankFeedsClientMock.object,
        createXeroHttpClient({ accountingApi: xeroClientMock.object } as XeroClient, new Lock(loggerMock.object), loggerMock.object),
        tenantId,
        { sanitize: () => Promise.resolve() },
        loggerMock.object,
    );

    beforeEach(() => {
        xeroClientMock
            .setup(m => m.getCurrencies(
                tenantId,
                `${CurrencyKeys.code}=="${CURRENCY}"`
            ))
            .returns(async () => ({
                response: {
                    headers: {},
                },
                body: {
                    currencies: [{
                        code: CURRENCY,
                    }],
                },
            }) as any);

        loggerMock.setup(l => l.child(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => loggerMock.object);
    });

    afterEach(() => {
        [
            xeroClientMock,
            authClientMock,
            accountingClientMock,
            loggerMock,
        ].forEach(m => {
            m.verifyAll();
            m.reset();
        });
    });

    describe('bank transactions', () => {
        it('should create spend bank transaction as tax inclusive with correct date string', async () => {
            const transaction = getSpendTransactionModel();

            const id = '1';

            xeroClientMock
                .setup(m => m.createBankTransactions(
                    tenantId,
                    typeIsEqualSkipUndefined(
                        {
                            bankTransactions: [{
                                bankTransactionID: undefined,
                                type: BankTransactionType.Spend as any,
                                bankAccount: {
                                    accountID: transaction.bankAccountId,
                                },
                                reference: transaction.reference,
                                date: transaction.date,
                                url: transaction.url,
                                contact: {
                                    contactID: transaction.contactId,
                                },
                                lineAmountTypes: LineAmountType.TaxInclusive as any,
                                lineItems: [
                                    {
                                        description: transaction.description,
                                        accountCode: transaction.accountCode,
                                        quantity: 1,
                                        unitAmount: transaction.amount,
                                        taxType: transaction.taxType,
                                    },
                                ],
                            },
                            ],
                        })))
                .returns(async () => {
                    return ({
                        response: {
                            headers: {},
                        },
                        body: {
                            bankTransactions: [
                                {
                                    statusAttributeString: ClientResponseStatus.Ok,
                                    bankTransactionID: id,
                                },
                            ],
                        },
                    }) as any;
                })
                .verifiable(TypeMoq.Times.once());

            const transactionId = await client.createTransaction(transaction);
            expect(transactionId).toEqual(id);
        });

        it('should create spend bank transaction with fees', async () => {
            const transaction = getSpendTransactionModel();
            transaction.fxFees = 1;
            transaction.posFees = 2;

            const id = '1';

            xeroClientMock
                .setup(m => m.createBankTransactions(
                    tenantId,
                    typeIsEqualSkipUndefined(
                        {
                            bankTransactions: [{
                                bankTransactionID: undefined,
                                type: BankTransactionType.Spend as any,
                                bankAccount: {
                                    accountID: transaction.bankAccountId,
                                },
                                reference: transaction.reference,
                                date: transaction.date,
                                url: transaction.url,
                                contact: {
                                    contactID: transaction.contactId,
                                },
                                lineAmountTypes: LineAmountType.TaxInclusive as any,
                                lineItems: [
                                    {
                                        description: transaction.description,
                                        accountCode: transaction.accountCode,
                                        quantity: 1,
                                        unitAmount: transaction.amount,
                                        taxType: transaction.taxType,
                                    },
                                    {
                                        description: 'Exchange + POS fees',
                                        accountCode: FEES_ACCOUNT_CODE,
                                        quantity: 1,
                                        unitAmount: transaction.fxFees + transaction.posFees,
                                    },
                                ],
                            },
                            ],
                        })))
                .returns(async () => {
                    return ({
                        response: {
                            headers: {},
                        },
                        body: {
                            bankTransactions: [
                                {
                                    statusAttributeString: ClientResponseStatus.Ok,
                                    bankTransactionID: id,
                                },
                            ],
                        },
                    }) as any;
                })
                .verifiable(TypeMoq.Times.once());

            const transactionId = await client.createTransaction(transaction);
            expect(transactionId).toEqual(id);
        });

        it('should create receive bank transaction with correct amount', async () => {
            const transaction = getReceiveTransactionModel();

            const id = '1';

            xeroClientMock
                .setup(m => m.createBankTransactions(
                    tenantId,
                    typeIsEqualSkipUndefined(
                        {
                            bankTransactions: [{
                                bankTransactionID: undefined,
                                type: BankTransactionType.Receive as any,
                                bankAccount: {
                                    accountID: transaction.bankAccountId,
                                },
                                reference: transaction.reference,
                                date: transaction.date,
                                url: transaction.url,
                                contact: {
                                    contactID: transaction.contactId,
                                },
                                lineAmountTypes: LineAmountType.TaxInclusive as any,
                                lineItems: [
                                    {
                                        description: transaction.description,
                                        accountCode: transaction.accountCode,
                                        quantity: 1,
                                        unitAmount: Math.abs(transaction.amount),
                                        taxType: transaction.taxType,
                                    },
                                ],
                            },
                            ],
                        })))
                .returns(async () => {
                    return ({
                        response: {
                            headers: {},
                        },
                        body: {
                            bankTransactions: [
                                {
                                    statusAttributeString: ClientResponseStatus.Ok,
                                    bankTransactionID: id,
                                },
                            ],
                        },
                    }) as any;
                })
                .verifiable(TypeMoq.Times.once());

            const transactionId = await client.createTransaction(transaction);
            expect(transactionId).toEqual(id);
        });

        it('should throw error', async () => {
            const transaction = getSpendTransactionModel();

            xeroClientMock
                .setup(m => m.createBankTransactions(
                    tenantId,
                    typeIsEqualSkipUndefined({
                        bankTransactions: [{
                            bankTransactionID: undefined,
                            type: BankTransactionType.Spend as any,
                            bankAccount: {
                                accountID: transaction.bankAccountId,
                            },
                            reference: transaction.reference,
                            date: transaction.date,
                            url: transaction.url,
                            contact: {
                                contactID: transaction.contactId,
                            },
                            lineAmountTypes: LineAmountType.TaxInclusive as any,
                            lineItems: [
                                {
                                    description: transaction.description,
                                    accountCode: transaction.accountCode,
                                    quantity: 1,
                                    unitAmount: transaction.amount,
                                    taxType: transaction.taxType,
                                },
                            ],
                        },
                        ],
                    })))
                .throws(new Error('Xero Error 1'))
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

            expect(error.message).toEqual('Error: Xero Error 1');
        });
    });

    describe('invoices', () => {
        it('should create spend invoice as tax inclusive with correct date and due date strings', async () => {
            const invoice = getBillModel();

            const id = '1';

            xeroClientMock
                .setup(m => m.createInvoices(
                    tenantId,
                    typeIsEqualSkipUndefined(
                        {
                            invoices: [{
                                invoiceID: undefined,
                                invoiceNumber: invoice.reference,
                                dueDate: invoice.dueDate,
                                type: InvoiceType.AccountsPayable as any,
                                currencyCode: invoice.currency as any,
                                status: Invoice.StatusEnum.AUTHORISED,
                                date: invoice.date,
                                url: invoice.url,
                                contact: {
                                    contactID: invoice.contactId,
                                },
                                lineAmountTypes: LineAmountType.TaxInclusive as any,
                                lineItems: [
                                    {
                                        description: invoice.description,
                                        accountCode: invoice.accountCode,
                                        quantity: 1,
                                        unitAmount: invoice.amount,
                                        taxType: invoice.taxType,
                                    },
                                ],
                                reference: invoice.reference,
                            },
                            ],
                        })))
                .returns(async () => ({
                    response: {
                        headers: {},
                    },
                    body: {
                        invoices: [
                            {
                                statusAttributeString: ClientResponseStatus.Ok,
                                invoiceID: id,
                            },
                        ],
                    },
                }) as any)
                .verifiable(TypeMoq.Times.once());

            const invoiceId = await client.createBill(invoice);
            expect(invoiceId).toEqual(id);
        });

        it('should throw error', async () => {
            const invoice = getBillModel();

            xeroClientMock
                .setup(m => m.createInvoices(
                    tenantId,
                    typeIsEqualSkipUndefined({
                        invoices: [{
                            invoiceID: undefined,
                            invoiceNumber: invoice.reference,
                            dueDate: invoice.dueDate,
                            type: InvoiceType.AccountsPayable as any,
                            currencyCode: invoice.currency as any,
                            status: Invoice.StatusEnum.AUTHORISED,
                            date: invoice.date,
                            url: invoice.url,
                            contact: {
                                contactID: invoice.contactId,
                            },
                            lineAmountTypes: LineAmountType.TaxInclusive as any,
                            lineItems: [
                                {
                                    description: invoice.description,
                                    accountCode: invoice.accountCode,
                                    quantity: 1,
                                    unitAmount: invoice.amount,
                                    taxType: invoice.taxType,
                                },
                            ],
                            reference: invoice.reference,
                        },
                        ],
                    })))
                .throws(new Error('Xero Error 1'))
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

            expect(error.message).toEqual('Error: Xero Error 1');
        });
    });

    describe('payments', () => {
        it('should create a payment if bill is not yet paid', async () => {
            const paymentDetails: IPaymentData = {
                date: new Date().toISOString(),
                itemId: '1',
                itemType: PaymentItemType.Invoice,
                amount: 100,
                currency: CURRENCY,
                fxRate: 1,
                bankAccountId: 'bank_id',
            };

            xeroClientMock
                .setup(m => m.createPayment(
                    tenantId,
                    {
                        date: paymentDetails.date,
                        invoice: {
                            invoiceID: paymentDetails.itemId,
                        },
                        account: {
                            accountID: paymentDetails.bankAccountId,
                        },
                        amount: paymentDetails.amount,
                        currencyRate: paymentDetails.fxRate,
                    }))
                .returns(async () => ({
                    response: {
                        headers: {},
                    },
                    body: {
                        payments: [
                            {
                                statusAttributeString: ClientResponseStatus.Ok,
                                paymentID: '2',
                            },
                        ],
                    },
                }) as any)
                .verifiable(TypeMoq.Times.once());

            await client.createPayment(paymentDetails);
        });
    });

    describe('escapeParam()', () => {
        it('should map to same value regardless of quotes and whitespace', () => {
            const expected = 'My Company Ltd.';
            expect(escapeParam('"My Company" Ltd.')).toEqual(expected);
            expect(escapeParam('"  My Company   " Ltd.')).toEqual(expected);
        });
    });

    describe('transaction model', () => {
        it('should map fx fees', () => {
            const model = getAccountingItemModel({
                description: 'desc',
                reference: 'ref',
                accountCode: '100',
                amount: 100,
                contactId: '1',
                date: new Date().toISOString(),
                url: '/',
                feesAccountCode: '200',
                fxFees: 1,
            });

            const feesItem = model.lineItems.find(l => l.accountCode === '200');
            expect(feesItem).not.toEqual(undefined);
            expect(feesItem!.description).toEqual('Exchange fees');
            expect(feesItem!.unitAmount).toEqual(1);
        });

        it('should map pos fees', () => {
            const model = getAccountingItemModel({
                description: 'desc',
                reference: 'ref',
                accountCode: '100',
                amount: 100,
                contactId: '1',
                date: new Date().toISOString(),
                url: '/',
                feesAccountCode: '200',
                posFees: 1,
            });

            const feesItem = model.lineItems.find(l => l.accountCode === '200');
            expect(feesItem).not.toEqual(undefined);
            expect(feesItem!.description).toEqual('POS fees');
            expect(feesItem!.unitAmount).toEqual(1);
        });

        it('should map fx + pos fees', () => {
            const model = getAccountingItemModel({
                description: 'desc',
                reference: 'ref',
                accountCode: '100',
                amount: 100,
                contactId: '1',
                date: new Date().toISOString(),
                url: '/',
                feesAccountCode: '200',
                posFees: 1,
                fxFees: 3,
            });

            const feesItem = model.lineItems.find(l => l.accountCode === '200');
            expect(feesItem).not.toEqual(undefined);
            expect(feesItem!.description).toEqual('Exchange + POS fees');
            expect(feesItem!.unitAmount).toEqual(4);
        });

        it('should map no fees', () => {
            const model = getAccountingItemModel({
                description: 'desc',
                reference: 'ref',
                accountCode: '100',
                amount: 100,
                contactId: '1',
                date: new Date().toISOString(),
                url: '/',
                feesAccountCode: '200',
            });

            const feesItem = model.lineItems.find(l => l.accountCode === '200');
            expect(feesItem).toEqual(undefined);
        });
    });

    function getSpendTransactionModel(): ICreateTransactionData {
        return createTransactionModel();
    }

    function getReceiveTransactionModel(): ICreateTransactionData {
        return createTransactionModel(true);
    }

    function createTransactionModel(isReceive: boolean = false): ICreateTransactionData {
        const transaction: ICreateTransactionData = {
            date: new Date(2012, 10, 10).toISOString(),
            bankAccountId: 'bank-account-id',
            contactId: 'contact-id',
            description: 'expense note',
            reference: 'tx description',
            amount: isReceive ? -12.05 : 12.05,
            fxFees: 0,
            posFees: 0,
            feesAccountCode: FEES_ACCOUNT_CODE,
            accountCode: '310',
            url: 'expense url',
            taxType: 'TAX001',
            lineItems: [{
                accountCode: '310',
                amount: 12.05,
                taxType: 'TAX001',
            }],
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
            reference: 'ref',
            amount: 12.05,
            bankFees: 0,
            fxFees: 0,
            posFees: 0,
            feesAccountCode: FEES_ACCOUNT_CODE,
            accountCode: '310',
            taxType: 'TAX001',
            url: 'expense url',
            lineItems: [{
                accountCode: '310',
                amount: 12.05,
                taxType: 'TAX001',
            }],
        };

        return bill;
    }
});
