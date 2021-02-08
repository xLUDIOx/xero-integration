import * as TypeMoq from 'typemoq';

import { FxRates, Payhawk, Xero } from '@services';
import { AccountStatus, TaxType } from '@shared';
import { Accounts, BankFeeds, ExpenseTransactions, ISchemaStore } from '@stores';
import { ILogger } from '@utils';

import * as XeroEntities from '../xero-entities';
import { getTransactionTotalAmount, Manager } from './Manager';

describe('integrations/Manager', () => {
    const accountId = 'account_id';
    const tenantId = 'tenant_id';
    const portalUrl = 'https://portal.payhawk.io';
    let payhawkClientMock: TypeMoq.IMock<Payhawk.IClient>;
    let xeroEntitiesMock: TypeMoq.IMock<XeroEntities.IManager>;
    let bankAccountsManagerMock: TypeMoq.IMock<XeroEntities.BankAccounts.IManager>;
    let bankFeedsManagerMock: TypeMoq.IMock<XeroEntities.BankFeeds.IManager>;
    let fxRatesServiceMock: TypeMoq.IMock<FxRates.IService>;
    let loggerMock: TypeMoq.IMock<ILogger>;
    let deleteFilesMock: TypeMoq.IMock<(f: string) => Promise<void>>;
    let expenseTransactionsStoreMock: TypeMoq.IMock<ExpenseTransactions.IStore>;
    let bankFeedsStoreMock: TypeMoq.IMock<BankFeeds.IStore>;
    let accountsStoreMock: TypeMoq.IMock<Accounts.IStore>;

    let manager: Manager;

    beforeEach(() => {
        payhawkClientMock = TypeMoq.Mock.ofType<Payhawk.IClient>();
        bankFeedsManagerMock = TypeMoq.Mock.ofType<XeroEntities.BankFeeds.IManager>();
        bankAccountsManagerMock = TypeMoq.Mock.ofType<XeroEntities.BankAccounts.IManager>();
        xeroEntitiesMock = TypeMoq.Mock.ofType<XeroEntities.IManager>();
        fxRatesServiceMock = TypeMoq.Mock.ofType<FxRates.IService>();
        loggerMock = TypeMoq.Mock.ofType<ILogger>();
        deleteFilesMock = TypeMoq.Mock.ofType<(f: string) => Promise<void>>();
        expenseTransactionsStoreMock = TypeMoq.Mock.ofType<ExpenseTransactions.IStore>();
        bankFeedsStoreMock = TypeMoq.Mock.ofType<BankFeeds.IStore>();
        accountsStoreMock = TypeMoq.Mock.ofType<Accounts.IStore>();

        xeroEntitiesMock
            .setup(x => x.bankFeeds)
            .returns(() => bankFeedsManagerMock.object);

        xeroEntitiesMock
            .setup(x => x.bankAccounts)
            .returns(() => bankAccountsManagerMock.object);

        expenseTransactionsStoreMock
            .setup(s => s.getByAccountId(accountId, TypeMoq.It.isAnyString()))
            .returns(async () => []);

        manager = new Manager(
            accountId,
            tenantId,
            portalUrl,
            {
                accounts: accountsStoreMock.object,
                expenseTransactions: expenseTransactionsStoreMock.object,
                bankFeeds: bankFeedsStoreMock.object,
            } as ISchemaStore,
            xeroEntitiesMock.object,
            payhawkClientMock.object,
            fxRatesServiceMock.object,
            deleteFilesMock.object,
            loggerMock.object,
        );

        loggerMock
            .setup(l => l.child(TypeMoq.It.isAny()))
            .returns(() => loggerMock.object);
    });

    afterEach(() => {
        [
            payhawkClientMock,
            xeroEntitiesMock,
            deleteFilesMock,
            bankAccountsManagerMock,
            bankFeedsManagerMock,
            bankFeedsStoreMock,
            expenseTransactionsStoreMock,
        ].forEach(x => {
            x.verifyAll();
            x.reset();
        });
    });

    describe('synchronizeChartOfAccounts', () => {
        test('gets expense accounts from xero and puts them on payhawk', async () => {
            const xeroAccounts: XeroEntities.IAccountCode[] = [
                {
                    accountId: '1',
                    name: 'Account 1',
                    code: '400',
                    status: AccountStatus.Active,
                    taxType: TaxType.TaxOnPurchases,
                    addToWatchlist: false,
                },
                {
                    accountId: '2',
                    name: 'Account 2',
                    code: '370',
                    status: AccountStatus.Active,
                    taxType: TaxType.TaxOnPurchases,
                    addToWatchlist: false,
                },
            ];

            const payhawkAccounts: Payhawk.IAccountCode[] = [
                {
                    name: 'Account 1',
                    code: '400',
                    defaultTaxCode: TaxType.TaxOnPurchases,
                },
                {
                    name: 'Account 2',
                    code: '370',
                    defaultTaxCode: TaxType.TaxOnPurchases,
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

    describe('export expense', () => {
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
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
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
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
                };

                expenseTransactionsStoreMock.reset();

                expenseTransactionsStoreMock
                    .setup(s => s.getByAccountId(accountId, TypeMoq.It.isAnyString()))
                    .returns(async () => [{
                        account_id: accountId,
                        expense_id: expenseId,
                        transaction_id: expense.transactions[0].id,
                    }]);

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

                expense.transactions.forEach(t => {
                    xeroEntitiesMock
                        .setup(x => x.createOrUpdateAccountTransaction({
                            date: t.settlementDate || t.date,
                            accountCode: reconciliation.accountCode,
                            taxType: 'TAX001',
                            bankAccountId,
                            contactId,
                            description: `${t.cardHolderName}${t.cardName ? `, ${t.cardName}` : ''}, *${t.cardLastDigits} | ${expense.note}`,
                            reference: t.description,
                            amount: t.cardAmount,
                            fxFees: t.fees.fx,
                            posFees: t.fees.pos,
                            files,
                            url: `${portalUrl}/expenses?transactionId=${encodeURIComponent(t.id)}&accountId=${encodeURIComponent(accountId)}`,
                        }))
                        .returns(() => Promise.resolve('1'))
                        .verifiable(TypeMoq.Times.once());

                    expenseTransactionsStoreMock
                        .setup(s => s.createIfNotExists(accountId, expenseId, t.id))
                        .verifiable(TypeMoq.Times.once());
                });

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateAccountTransaction(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.exactly(expense.transactions.length));

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                const shortCode = '!ef94Az';
                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({ shortCode } as XeroEntities.IOrganisation))
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

            test('updates account transaction when expense reaches final state - settlement', async () => {
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
                            id: 'tx_id',
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
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
                };

                const transaction = expense.transactions[0];

                expenseTransactionsStoreMock.reset();

                expenseTransactionsStoreMock
                    .setup(s => s.getByAccountId(accountId, TypeMoq.It.isAnyString()))
                    .returns(async () => [{
                        account_id: accountId,
                        expense_id: expenseId,
                        transaction_id: transaction.id,
                    }]);

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

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateAccountTransaction({
                        date: transaction.settlementDate || transaction.date,
                        accountCode: reconciliation.accountCode,
                        taxType: 'TAX001',
                        bankAccountId,
                        contactId,
                        description: `${transaction.cardHolderName}${transaction.cardName ? `, ${transaction.cardName}` : ''}, *${transaction.cardLastDigits} | ${expense.note}`,
                        reference: transaction.description,
                        amount: transaction.cardAmount,
                        fxFees: transaction.fees.fx,
                        posFees: transaction.fees.pos,
                        files,
                        url: `${portalUrl}/expenses?transactionId=${encodeURIComponent(transaction.id)}&accountId=${encodeURIComponent(accountId)}`,
                    }))
                    .returns(() => Promise.resolve('1'))
                    .verifiable(TypeMoq.Times.once());

                expenseTransactionsStoreMock
                    .setup(s => s.createIfNotExists(accountId, expenseId, transaction.id))
                    .verifiable(TypeMoq.Times.once());

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateAccountTransaction(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.exactly(expense.transactions.length));

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                const shortCode = '!ef94Az';
                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({ shortCode } as XeroEntities.IOrganisation))
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
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
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
                        taxType: 'TAX001',
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
                    .returns(async () => ({ shortCode } as XeroEntities.IOrganisation))
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
                    document: { files: [] },
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
                        taxType: undefined,
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
                    .returns(async () => ({ shortCode } as XeroEntities.IOrganisation))
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
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({} as XeroEntities.IOrganisation))
                    .verifiable(TypeMoq.Times.once());

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill({
                        bankAccountId: undefined,
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        taxType: undefined,
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

        beforeEach(() => {
            xeroEntitiesMock
                .setup(m => m.getOrganisation())
                .returns(async () => ({} as XeroEntities.IOrganisation));
        });

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
                        amount: -t.amount,
                        taxType: TaxType.None,
                        fxFees: 0,
                        posFees: 0,
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

    describe('disconnect', () => {
        beforeEach(() => {
            xeroEntitiesMock
                .setup(m => m.getOrganisation())
                .returns(async () => ({ isDemoCompany: false } as XeroEntities.IOrganisation));
        });

        it('should do nothing if demo org', async () => {
            xeroEntitiesMock.reset();
            xeroEntitiesMock
                .setup(m => m.getOrganisation())
                .returns(async () => ({ isDemoCompany: true } as XeroEntities.IOrganisation));

            bankFeedsStoreMock
                .setup(s => s.getConnectionIdsForAccount(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            bankFeedsStoreMock
                .setup(s => s.deleteConnectionForAccount(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            bankFeedsManagerMock
                .setup(m => m.closeBankFeedConnection(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            await manager.disconnect();
        });

        it('should do nothing if no connections', async () => {
            bankFeedsStoreMock
                .setup(s => s.getConnectionIdsForAccount(accountId))
                .returns(async () => [])
                .verifiable(TypeMoq.Times.once());

            bankFeedsStoreMock
                .setup(s => s.deleteConnectionForAccount(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            bankFeedsManagerMock
                .setup(m => m.closeBankFeedConnection(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            await manager.disconnect();
        });

        it('should iterate all connections and disconnect them', async () => {
            const connectionIds = ['1', '2'];

            bankFeedsStoreMock
                .setup(s => s.getConnectionIdsForAccount(accountId))
                .returns(async () => connectionIds)
                .verifiable(TypeMoq.Times.once());

            connectionIds.forEach(connectionId => {
                bankFeedsManagerMock
                    .setup(m => m.closeBankFeedConnection(connectionId))
                    .verifiable(TypeMoq.Times.once());

                bankFeedsStoreMock
                    .setup(s => s.deleteConnectionForAccount(accountId, connectionId))
                    .verifiable(TypeMoq.Times.once());
            });

            await manager.disconnect();
        });
    });

    describe('initial sync', () => {
        describe('does nothing if', () => {
            beforeAll(() => {
                xeroEntitiesMock
                    .setup(m => m.getExpenseAccounts())
                    .verifiable(TypeMoq.Times.never());

                payhawkClientMock
                    .setup(p => p.synchronizeChartOfAccounts(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.never());

                xeroEntitiesMock
                    .setup(m => m.getTaxRates())
                    .verifiable(TypeMoq.Times.never());

                payhawkClientMock
                    .setup(p => p.synchronizeTaxRates(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.never());

                payhawkClientMock
                    .setup(p => p.getBankAccounts())
                    .verifiable(TypeMoq.Times.never());

                bankAccountsManagerMock
                    .setup(m => m.get())
                    .verifiable(TypeMoq.Times.never());

                payhawkClientMock
                    .setup(p => p.synchronizeBankAccounts(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.never());
            });

            it('account is already synced', async () => {
                accountsStoreMock
                    .setup(s => s.get(accountId))
                    .returns(async () => ({ account_id: accountId, initial_sync_completed: true, tenant_id: '' }))
                    .verifiable(TypeMoq.Times.once());

                await manager.initialSynchronization();
            });
            it('account initial tenant is different', async () => {
                accountsStoreMock
                    .setup(s => s.get(accountId))
                    .returns(async () => ({ account_id: accountId, initial_sync_completed: false, tenant_id: '' }))
                    .verifiable(TypeMoq.Times.once());

                await manager.initialSynchronization();
            });
        });
    });

    describe('getTransactionTotalAmount', () => {
        it('should calculate correctly', () => {
            const result = getTransactionTotalAmount({ cardAmount: 336.1400, fees: { fx: 3.03, pos: 0 } } as any);
            expect(result).toEqual(339.17);
        });
    });
});
