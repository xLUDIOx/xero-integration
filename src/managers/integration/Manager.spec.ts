import * as TypeMoq from 'typemoq';

import { Payhawk } from '../../services';
import * as XeroEntities from '../xero-entities';
import { Manager } from './Manager';

describe('integrations/Manager', () => {
    let payhawkClientMock: TypeMoq.IMock<Payhawk.IClient>;
    let xeroEntitiesMock: TypeMoq.IMock<XeroEntities.IManager>;

    let manager: Manager;

    beforeEach(() => {
        payhawkClientMock = TypeMoq.Mock.ofType<Payhawk.IClient>();
        xeroEntitiesMock = TypeMoq.Mock.ofType<XeroEntities.IManager>();

        manager = new Manager(payhawkClientMock.object, xeroEntitiesMock.object);
    });

    afterEach(() => {
        payhawkClientMock.verifyAll();
        xeroEntitiesMock.verifyAll();
    });

    describe('synchronizeChartOfAccounts', () => {
        test('gets expense accounts from xero and puts them on payhawk', async () => {
            const xeroAccounts: XeroEntities.IAccountCode[] = [
                {
                    Name: 'Account 1',
                    Code: '400',
                },
                {
                    Name: 'Account 2',
                    Code: '370',
                },
            ];

            const payhawkAccounts: Payhawk.IAccountCode[] = [
                {
                    name: 'Account 1',
                    code: '400',
                },
                {
                    name: 'Account 2',
                    code: '370',
                },
            ];

            xeroEntitiesMock
                .setup(x => x.getExpenseAccounts())
                .returns(async () => xeroAccounts);

            payhawkClientMock
                .setup(p => p.synchronizeChartOfAccounts(payhawkAccounts))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await manager.synchronizeChartOfAccounts();
        });
    });

    describe('exportExpense', () => {
        const reconciliation: Payhawk.IReconciliation = {
            accountCode: '420',
            baseCurrency: 'EUR',
            expenseCurrency: 'USD',
            baseTaxAmount: 2,
            baseTotalAmount: 10,
            expenseTaxAmount: 2.26,
            expenseTotalAmount: 11.28,
            customFields: { },
        };

        const supplier: Payhawk.ISupplier = {
            name: 'Supplier Inc',
            address: 'London',
            countryCode: 'UK',
        };

        describe('as an account transaction', () => {
            test('creates an account transaction when expense has transactions', async () => {
                const expenseId = 'expenseId';
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    title: txDescription,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: 5,
                            cardCurrency: 'EUR',
                            cardHolderName: 'John Smith',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'USD',
                            settlementDate: new Date(2019, 2, 3),
                        },
                        {
                            id: 'tx2',
                            cardAmount: 5,
                            cardCurrency: 'EUR',
                            cardHolderName: 'John Smith',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'USD',
                            settlementDate: new Date(2019, 2, 3),
                        },
                    ],
                };

                const bankAccountId = 'bank-account-id';
                const contactId = 'contact-id';
                payhawkClientMock
                    .setup(p => p.getExpense(expenseId))
                    .returns(async () => expense);

                xeroEntitiesMock
                    .setup(x => x.getBankAccountIdForCurrency(expense.transactions[0].cardCurrency))
                    .returns(async () => bankAccountId);

                xeroEntitiesMock
                    .setup(x => x.getContactIdForSupplier(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createAccountTransaction({
                        accountCode: reconciliation.accountCode,
                        bankAccountId,
                        contactId,
                        description: expense.note,
                        reference: expense.transactions[0].description,
                        totalAmount: 10,
                    }))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());

                await manager.exportExpense(expenseId);
            });
        });

        describe('as a bill', () => {
            test('creates a bill when expense has no transactions', async () => {
                const expenseId = 'expenseId';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    title: 'My Cash Expense',
                    transactions: [ ],
                };

                const contactId = 'contact-id';
                payhawkClientMock
                    .setup(p => p.getExpense(expenseId))
                    .returns(async () => expense);

                xeroEntitiesMock
                    .setup(x => x.getContactIdForSupplier(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createBill({
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency,
                        contactId,
                        description: expense.note,
                        totalAmount: 11.28,
                    }))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());

                await manager.exportExpense(expenseId);
            });
        });
    });
});
