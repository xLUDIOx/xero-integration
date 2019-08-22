import * as TypeMoq from 'typemoq';

import { Payhawk } from '../../services';
import * as XeroEntities from '../xero-entities';
import { Manager } from './Manager';

describe('integrations/Manager', () => {
    const accountId = 'account_id';
    const portalUrl = 'https://portal.payhawk.io';
    let payhawkClientMock: TypeMoq.IMock<Payhawk.IClient>;
    let xeroEntitiesMock: TypeMoq.IMock<XeroEntities.IManager>;
    let deleteFilesMock: TypeMoq.IMock<(f: string) => Promise<void>>;

    let manager: Manager;

    beforeEach(() => {
        payhawkClientMock = TypeMoq.Mock.ofType<Payhawk.IClient>();
        xeroEntitiesMock = TypeMoq.Mock.ofType<XeroEntities.IManager>();
        deleteFilesMock = TypeMoq.Mock.ofType<(f: string) => Promise<void>>();

        manager = new Manager(payhawkClientMock.object, xeroEntitiesMock.object, deleteFilesMock.object, accountId, portalUrl);
    });

    afterEach(() => {
        payhawkClientMock.verifyAll();
        xeroEntitiesMock.verifyAll();
        deleteFilesMock.verifyAll();
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

        const files: Payhawk.IDownloadedFile[] = [
            {
                contentType: 'image/jpeg',
                path: 'tmp/file.jpg',
            },
            {
                contentType: 'image/png',
                path: 'tmp/file.png',
            },
        ];

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

                payhawkClientMock
                    .setup(p => p.downloadFiles(expense))
                    .returns(async () => files);

                xeroEntitiesMock
                    .setup(x => x.getBankAccountIdForCurrency(expense.transactions[0].cardCurrency))
                    .returns(async () => bankAccountId);

                xeroEntitiesMock
                    .setup(x => x.getContactIdForSupplier(supplier))
                    .returns(async () => contactId);

                expense.transactions.forEach(t =>
                    xeroEntitiesMock
                        .setup(x => x.createOrUpdateAccountTransaction({
                            accountCode: reconciliation.accountCode,
                            bankAccountId,
                            contactId,
                            description: expense.note,
                            reference: t.description,
                            totalAmount: t.cardAmount,
                            files,
                            url: `${portalUrl}/expenses?transactionId=${encodeURIComponent(t.id)}&accountId=${encodeURIComponent(accountId)}`,
                        }))
                        .returns(() => Promise.resolve())
                        .verifiable(TypeMoq.Times.once()),
                );

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateAccountTransaction(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.exactly(expense.transactions.length));

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

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

                payhawkClientMock
                    .setup(p => p.downloadFiles(expense))
                    .returns(async () => files);

                xeroEntitiesMock
                    .setup(x => x.getContactIdForSupplier(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill({
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency,
                        contactId,
                        description: expense.note,
                        totalAmount: 11.28,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    }))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                await manager.exportExpense(expenseId);
            });

            test('deletes files even when create bill fails', async () => {
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

                payhawkClientMock
                    .setup(p => p.downloadFiles(expense))
                    .returns(async () => files);

                xeroEntitiesMock
                    .setup(x => x.getContactIdForSupplier(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill({
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency,
                        contactId,
                        description: expense.note,
                        totalAmount: 11.28,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    }))
                    .returns(() => Promise.reject())
                    .verifiable(TypeMoq.Times.once());

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                try {
                    await manager.exportExpense(expenseId);
                    fail();
                } catch {
                    //
                }
            });
        });
    });
});
