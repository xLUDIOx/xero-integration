import * as TypeMoq from 'typemoq';
import { Account } from 'xero-node';

import { FxRates, Payhawk, Xero } from '@services';
import { ExpenseTransactions, ISchemaStore } from '@stores';
import { ILogger } from '@utils';

import * as XeroEntities from '../xero-entities';
import { Manager } from './Manager';

describe('integrations/Manager', () => {
    const accountId = 'account_id';
    const portalUrl = 'https://portal.payhawk.io';
    let payhawkClientMock: TypeMoq.IMock<Payhawk.IClient>;
    let xeroEntitiesMock: TypeMoq.IMock<XeroEntities.IManager>;
    let bankAccountsManagerMock: TypeMoq.IMock<XeroEntities.BankAccounts.IManager>;
    let fxRatesServiceMock: TypeMoq.IMock<FxRates.IService>;
    let loggerMock: TypeMoq.IMock<ILogger>;
    let deleteFilesMock: TypeMoq.IMock<(f: string) => Promise<void>>;
    let storeMock: TypeMoq.IMock<ExpenseTransactions.IStore>;

    let manager: Manager;

    beforeEach(() => {
        payhawkClientMock = TypeMoq.Mock.ofType<Payhawk.IClient>();
        xeroEntitiesMock = TypeMoq.Mock.ofType<XeroEntities.IManager>();
        bankAccountsManagerMock = TypeMoq.Mock.ofType<XeroEntities.BankAccounts.IManager>();
        fxRatesServiceMock = TypeMoq.Mock.ofType<FxRates.IService>();
        loggerMock = TypeMoq.Mock.ofType<ILogger>();
        deleteFilesMock = TypeMoq.Mock.ofType<(f: string) => Promise<void>>();
        storeMock = TypeMoq.Mock.ofType<ExpenseTransactions.IStore>();

        xeroEntitiesMock
            .setup(x => x.bankAccounts)
            .returns(() => bankAccountsManagerMock.object);

        storeMock
            .setup(s => s.getByAccountId(accountId, TypeMoq.It.isAnyString()))
            .returns(async () => []);

        manager = new Manager(
            { expenseTransactions: storeMock.object } as ISchemaStore,
            payhawkClientMock.object,
            xeroEntitiesMock.object,
            fxRatesServiceMock.object,
            deleteFilesMock.object,
            accountId,
            portalUrl,
            loggerMock.object,
        );
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
                    accountID: '1',
                    name: 'Account 1',
                    code: '400',
                    status: Account.StatusEnum.ACTIVE,
                    addToWatchlist: false,
                },
                {
                    accountID: '2',
                    name: 'Account 2',
                    code: '370',
                    status: Account.StatusEnum.ACTIVE,
                    addToWatchlist: false,
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
            customFields: {},
        };

        const supplier: Payhawk.ISupplier = {
            name: 'Supplier Inc',
            address: 'London',
            countryCode: 'UK',
        };

        const files: Payhawk.IDownloadedFile[] = [
            {
                contentType: 'image/jpeg',
                fileName: 'file.jpg',
                path: 'tmp/12312.file.jpg',
            },
            {
                contentType: 'image/png',
                fileName: 'file.png',
                path: 'tmp/534343.file.png',
            },
        ];

        describe('as an account transaction', () => {
            test('creates an account transaction when expense has transactions', async () => {
                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    paymentData: {},
                    title: txDescription,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: 5,
                            cardCurrency: 'EUR',
                            cardName: 'Card 1',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'USD',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: 1,
                        },
                        {
                            id: 'tx2',
                            cardAmount: 5,
                            cardCurrency: 'EUR',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'USD',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: 2,
                        },
                    ],
                    externalLinks: [],
                };

                const bankAccountId = 'bank-account-id';
                const contactId = 'contact-id';
                payhawkClientMock
                    .setup(p => p.getExpense(expenseId))
                    .returns(async () => expense);

                payhawkClientMock
                    .setup(p => p.downloadFiles(expense))
                    .returns(async () => files);

                bankAccountsManagerMock
                    .setup(x => x.getOrCreateByCurrency(expense.transactions[0].cardCurrency))
                    .returns(async () => ({ accountID: bankAccountId } as Xero.IBankAccount));

                xeroEntitiesMock
                    .setup(x => x.getContactIdForSupplier(supplier))
                    .returns(async () => contactId);

                expense.transactions.forEach(t =>
                    xeroEntitiesMock
                        .setup(x => x.createOrUpdateAccountTransaction({
                            date: t.settlementDate || t.date,
                            accountCode: reconciliation.accountCode,
                            bankAccountId,
                            contactId,
                            description: `${t.cardHolderName}${t.cardName ? `, ${t.cardName}` : ''}, *${t.cardLastDigits} | ${expense.note}`,
                            reference: t.description,
                            totalAmount: t.cardAmount + t.fees,
                            files,
                            url: `${portalUrl}/expenses?transactionId=${encodeURIComponent(t.id)}&accountId=${encodeURIComponent(accountId)}`,
                        }))
                        .returns(() => Promise.resolve('1'))
                        .verifiable(TypeMoq.Times.once()),
                );

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateAccountTransaction(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.exactly(expense.transactions.length));

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                const shortCode = '!ef94Az';
                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({ shortCode } as Xero.IOrganisation))
                    .verifiable(TypeMoq.Times.once());

                payhawkClientMock
                    .setup(x => x.updateExpense(
                        expenseId,
                        {
                            externalLinks: [{
                                title: 'Xero',
                                url: `https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=/Bank/ViewTransaction.aspx?bankTransactionID=1`,
                            }],
                        }));

                await manager.exportExpense(expenseId);
            });
        });

        describe('as a bill', () => {
            test('creates a bill when expense has no transactions', async () => {
                const expenseId = 'expenseId';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    paymentData: {},
                    title: 'My Cash Expense',
                    transactions: [],
                    externalLinks: [],
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
                        bankAccountId: undefined,
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        totalAmount: 11.28,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    }))
                    .returns(() => Promise.resolve('1'))
                    .verifiable(TypeMoq.Times.once());

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                const shortCode = '!ef94Az';
                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({ shortCode } as Xero.IOrganisation))
                    .verifiable(TypeMoq.Times.once());

                payhawkClientMock
                    .setup(x => x.updateExpense(
                        expenseId,
                        {
                            externalLinks: [{
                                title: 'Xero',
                                url: `https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=/AccountsPayable/Edit.aspx?InvoiceID=1`,
                            }],
                        }));

                await manager.exportExpense(expenseId);
            });

            test('creates a bill when expense has no due date or document date', async () => {
                const expenseId = 'expenseId';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    document: { type: 'invoice', files: [] },
                    paymentData: {},
                    title: 'My Cash Expense',
                    transactions: [],
                    externalLinks: [],
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
                        bankAccountId: undefined,
                        date: expense.createdAt,
                        dueDate: expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        totalAmount: 11.28,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    }))
                    .returns(() => Promise.resolve('1'))
                    .verifiable(TypeMoq.Times.once());

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                const shortCode = '!ef94Az';
                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({ shortCode } as Xero.IOrganisation))
                    .verifiable(TypeMoq.Times.once());

                payhawkClientMock
                    .setup(x => x.updateExpense(
                        expenseId,
                        {
                            externalLinks: [{
                                title: 'Xero',
                                url: `https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=/AccountsPayable/Edit.aspx?InvoiceID=1`,
                            }],
                        }));

                await manager.exportExpense(expenseId);
            });

            test('deletes files even when create bill fails', async () => {
                const expenseId = 'expenseId';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    paymentData: {
                        dueDate: new Date(2019, 2, 12).toISOString(),
                    },
                    title: 'My Cash Expense',
                    transactions: [],
                    externalLinks: [],
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
                        bankAccountId: undefined,
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
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

    describe('export transfers', () => {
        const startDate = new Date().toISOString();
        const endDate = new Date().toISOString();

        test('creates an account transaction for each transfer', async () => {
            await testTransfersExport(new Date(), 'account');
        });
        test('creates an account transaction for each transfer - backward compat', async () => {
            await testTransfersExport(new Date(2020, 0, 28, 23, 59, 59), 'accountId');
        });

        const testTransfersExport = async (date: Date, paramName: string) => {
            const bankAccountId = 'bank-account-id';
            const contactId = 'contact-id';
            const transfers = [{
                id: '1',
                amount: 1000,
                currency: 'BGN',
                date: date.toISOString(),
            }, {
                id: '2',
                amount: 2000,
                currency: 'EUR',
                date: date.toISOString(),
            }, {
                id: '3',
                amount: 3000,
                currency: 'EUR',
                date: date.toISOString(),
            }];

            payhawkClientMock
                .setup(c => c.getTransfers(startDate, endDate))
                .returns(async () => transfers)
                .verifiable(TypeMoq.Times.once());

            payhawkClientMock
                .setup(c => c.getTransfers(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            const uniqueCurrencies = new Set(transfers.map(t => t.currency));
            uniqueCurrencies.forEach(t => {
                bankAccountsManagerMock
                    .setup(e => e.getOrCreateByCurrency(t))
                    .returns(async () => ({ accountID: bankAccountId } as Xero.IBankAccount))
                    .verifiable(TypeMoq.Times.once());
            });

            bankAccountsManagerMock
                .setup(e => e.getOrCreateByCurrency(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(uniqueCurrencies.size));

            xeroEntitiesMock
                .setup(e => e.getContactIdForSupplier({ name: 'New Deposit' }))
                .returns(async () => contactId)
                .verifiable(TypeMoq.Times.once());

            xeroEntitiesMock
                .setup(e => e.getContactIdForSupplier(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            transfers.forEach(t => {
                xeroEntitiesMock
                    .setup(e => e.createOrUpdateAccountTransaction({
                        date: t.date,
                        bankAccountId,
                        contactId,
                        reference: `Bank wire received on ${new Date(t.date).toUTCString()}`,
                        totalAmount: -t.amount,
                        files: [],
                        url: `${portalUrl}/funds?transferId=${encodeURIComponent(t.id)}&${paramName}=${encodeURIComponent(accountId)}`,
                    }))
                    .verifiable(TypeMoq.Times.once());
            });

            xeroEntitiesMock
                .setup(e => e.createOrUpdateAccountTransaction(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(transfers.length));

            await manager.exportTransfers(startDate, endDate);
        };
    });
});
