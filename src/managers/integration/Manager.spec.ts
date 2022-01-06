import * as TypeMoq from 'typemoq';

import { Payhawk, Xero } from '@services';
import { AccountStatus, TaxType } from '@shared';
import { Accounts, BankFeeds, ExpenseTransactions, ISchemaStore } from '@stores';
import { typeIsEqualSkipUndefined } from '@test-utils';
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
                    description: '',
                    status: AccountStatus.Active,
                    taxType: TaxType.TaxOnPurchases,
                    addToWatchlist: false,
                },
                {
                    accountId: '2',
                    name: 'Account 2',
                    code: '370',
                    description: '',
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

    describe('synchronize bank accounts', () => {
        test('pushes payhawk bank accounts into xero and pulls all other accounts from xero', async () => {
            const payhawkAccounts: Payhawk.IBalance[] = [{
                currency: 'EUR',
                id: '1',
            }, {
                currency: 'GBP',
                id: '2',
            }];

            payhawkClientMock
                .setup(c => c.getBankAccounts())
                .returns(async () => payhawkAccounts)
                .verifiable(TypeMoq.Times.once());

            const payhawkBankAccounts = payhawkAccounts.map(({ id, currency }) => ({
                accountID: id,
                currencyCode: currency as any,
                name: `PHWK-${currency}`,
                bankAccountNumber: `PHWK-${currency}`,
            }));

            payhawkAccounts.forEach(c => bankAccountsManagerMock
                .setup(m => m.getOrCreateByCurrency(c.currency))
                .returns(async () => payhawkBankAccounts.find(b => b.currencyCode.toString() === c.currency) as Xero.IBankAccount));

            const businessBankAccount: Partial<Xero.IBankAccount> = {
                accountID: 'acc_id',
                name: 'Business Bank Account',
                bankAccountNumber: 'acc_num',
                currencyCode: 'GBP' as any,
            };

            const xeroBankAccounts: Partial<Xero.IBankAccount>[] = [
                ...payhawkBankAccounts,
                businessBankAccount,
            ];

            bankAccountsManagerMock
                .setup(m => m.get())
                .returns(async () => xeroBankAccounts as Xero.IBankAccount[]);

            payhawkClientMock
                .setup(c => c.synchronizeBankAccounts([{
                    externalId: businessBankAccount.accountID!,
                    name: businessBankAccount.name!,
                    number: businessBankAccount.bankAccountNumber!,
                    currency: businessBankAccount.currencyCode!.toString(),
                }]))
                .verifiable(TypeMoq.Times.once());

            await manager.synchronizeBankAccounts();
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

        describe('no export', () => {
            const expenseId = 'expenseId';

            it('should not export locked expense', async () => {
                payhawkClientMock
                    .setup(p => p.getExpense(expenseId))
                    .returns(async () => ({ isLocked: true } as any));

                payhawkClientMock
                    .setup(p => p.downloadFiles(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.never());

                xeroEntitiesMock
                    .setup(x => x.getOrganisation())
                    .verifiable(TypeMoq.Times.never());

                await manager.exportExpense(expenseId);
            });

            it('should not export expense which is not ready for reconciliation', async () => {
                payhawkClientMock
                    .setup(p => p.getExpense(expenseId))
                    .returns(async () => ({ isLocked: false, isReadyForReconciliation: false } as any));

                payhawkClientMock
                    .setup(p => p.downloadFiles(TypeMoq.It.isAny()))
                    .verifiable(TypeMoq.Times.never());

                xeroEntitiesMock
                    .setup(x => x.getOrganisation())
                    .verifiable(TypeMoq.Times.never());

                await manager.exportExpense(expenseId);
            });
        });

        describe('balance payments', () => {
            test('creates bill with payment when expense has settled payment in same currency', async () => {
                const settledBalancePayment: Payhawk.IBalancePayment = {
                    amount: reconciliation.expenseTotalAmount,
                    currency: reconciliation.expenseCurrency!,
                    date: new Date().toISOString(),
                    fees: 0,
                    id: '123',
                    status: Payhawk.BalancePaymentStatus.Settled,
                };

                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    paymentData: {
                        sourceType: Payhawk.PaymentSourceType.Balance,
                        source: 'ala-bala',
                        date: new Date().toISOString(),
                    },
                    title: txDescription,
                    isReadyForReconciliation: true,
                    transactions: [],
                    balancePayments: [settledBalancePayment],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
                    isPaid: true,
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
                    .setup(x => x.getOrCreateByCurrency(expense.balancePayments[0].currency))
                    .returns(async () => ({ accountID: bankAccountId } as Xero.IBankAccount));

                xeroEntitiesMock
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        reference: `expense-${expenseId}`,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: [{
                            amount: settledBalancePayment.amount,
                            bankAccountId,
                            currency: settledBalancePayment.currency,
                            date: settledBalancePayment.date,
                            bankFees: settledBalancePayment.fees,
                        }],
                        totalAmount: reconciliation.expenseTotalAmount,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                        lineItems: [{
                            amount: reconciliation.expenseTotalAmount,
                            taxAmount: reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
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

            test('creates bill with payment when expense has settled payment in different currency', async () => {
                const settledBalancePayment: Payhawk.IBalancePayment = {
                    amount: reconciliation.expenseTotalAmount * 2,
                    currency: 'GBP',
                    date: new Date().toISOString(),
                    fees: 0,
                    id: '123',
                    status: Payhawk.BalancePaymentStatus.Settled,
                };

                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    paymentData: {
                        sourceType: Payhawk.PaymentSourceType.Balance,
                        source: 'ala-bala',
                        date: new Date().toISOString(),
                    },
                    title: txDescription,
                    isReadyForReconciliation: true,
                    transactions: [],
                    balancePayments: [settledBalancePayment],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
                    isPaid: true,
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
                    .setup(x => x.getOrCreateByCurrency(expense.balancePayments[0].currency))
                    .returns(async () => ({ accountID: bankAccountId } as Xero.IBankAccount));

                xeroEntitiesMock
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        reference: `expense-${expenseId}`,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: [{
                            amount: settledBalancePayment.amount,
                            bankAccountId,
                            currency: settledBalancePayment.currency,
                            date: settledBalancePayment.date,
                            bankFees: settledBalancePayment.fees,
                        }],
                        totalAmount: reconciliation.expenseTotalAmount,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                        lineItems: [{
                            amount: reconciliation.expenseTotalAmount,
                            taxAmount: reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
                    .returns(() => Promise.resolve('1'))
                    .verifiable(TypeMoq.Times.once());

                deleteFilesMock.setup(d => d(files[0].path)).verifiable(TypeMoq.Times.once());
                deleteFilesMock.setup(d => d(files[1].path)).verifiable(TypeMoq.Times.once());

                const shortCode = '!ef94Az';
                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({ shortCode, baseCurrency: 'GBP' } as XeroEntities.IOrganisation))
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
        });

        describe('card', () => {
            test('creates bill with payments when expense has settled transactions', async () => {
                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    paymentData: {},
                    title: txDescription,
                    isReadyForReconciliation: true,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: 5,
                            cardCurrency: 'USD',
                            cardName: 'Card 1',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
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
                            cardCurrency: 'USD',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    balancePayments: [],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        reference: `expense-${expenseId}`,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: expense.transactions.map<XeroEntities.IPayment>(t => ({
                            amount: t.cardAmount,
                            bankAccountId,
                            currency: t.cardCurrency,
                            date: t.settlementDate!,
                            fxFees: t.fees.fx,
                            posFees: t.fees.pos,
                        })),
                        totalAmount: 10,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                        lineItems: [{
                            amount: 10,
                            taxAmount: reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
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

            test('creates bill with payments and multiple line items when expense has settled transactions', async () => {
                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation: {
                        ...reconciliation,
                        accountCode: undefined,
                    },
                    supplier,
                    recipient: supplier,
                    paymentData: {},
                    title: txDescription,
                    isReadyForReconciliation: true,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: 5,
                            cardCurrency: 'USD',
                            cardName: 'Card 1',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
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
                            cardCurrency: 'USD',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    lineItems: [{
                        id: 'test',
                        reconciliation: {
                            ...reconciliation,
                            expenseTotalAmount: 10,
                            accountCode: 'line_item',
                        },
                        taxRate: {
                            code: 'TAX001',
                            name: 'Test',
                            rate: 14,
                        },
                    }],
                    balancePayments: [],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        reference: `expense-${expenseId}`,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: expense.transactions.map<XeroEntities.IPayment>(t => ({
                            amount: t.cardAmount,
                            bankAccountId,
                            currency: t.cardCurrency,
                            date: t.settlementDate!,
                            fxFees: t.fees.fx,
                            posFees: t.fees.pos,
                        })),
                        totalAmount: 10,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                        lineItems: [{
                            amount: 10,
                            taxAmount: expense.lineItems![0].reconciliation.expenseTaxAmount,
                            accountCode: expense.lineItems![0].reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
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

            test.skip('creates bill with fallback to default account code for line items', async () => {
                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation: {
                        ...reconciliation,
                        accountCode: undefined,
                    },
                    supplier,
                    recipient: supplier,
                    paymentData: {},
                    title: txDescription,
                    isReadyForReconciliation: false,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: 5,
                            cardCurrency: 'USD',
                            cardName: 'Card 1',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
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
                            cardCurrency: 'USD',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    lineItems: [{
                        id: 'test',
                        reconciliation: {
                            ...reconciliation,
                            expenseTotalAmount: 10,
                            accountCode: 'line_item',
                        },
                        taxRate: {
                            code: 'TAX001',
                            name: 'Test',
                            rate: 14,
                        },
                    }],
                    balancePayments: [],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: [],
                        totalAmount: 10,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                        lineItems: [{
                            amount: 10,
                            accountCode: undefined,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
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

            test.skip('creates bill with no payments and default acc code when expense has auth transactions', async () => {
                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    paymentData: {},
                    title: txDescription,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: 5,
                            cardCurrency: 'USD',
                            cardName: 'Card 1',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                        {
                            id: 'tx2',
                            cardAmount: 5,
                            cardCurrency: 'USD',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: 5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    balancePayments: [],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: undefined,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        fxRate: undefined,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: [],
                        totalAmount: 10,
                        files,
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                        lineItems: [{
                            amount: 10,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
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

            test('creates credit note with payments when expense is refund', async () => {
                const expenseId = 'expenseId';
                // cspell:disable-next-line
                const txDescription = 'ALLGATE GMBH \Am Flughafen 35 \MEMMINGERBERG\ 87766 DEUDEU';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    paymentData: {},
                    title: txDescription,
                    isReadyForReconciliation: true,
                    transactions: [
                        {
                            id: 'tx1',
                            cardAmount: -5,
                            cardCurrency: 'USD',
                            cardName: 'Card 1',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: -5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                        {
                            id: 'tx2',
                            cardAmount: -5,
                            cardCurrency: 'USD',
                            cardHolderName: 'John Smith',
                            cardLastDigits: '9999',
                            description: txDescription,
                            paidAmount: -5.64,
                            paidCurrency: 'EUR',
                            date: new Date(2019, 2, 3).toISOString(),
                            settlementDate: new Date(2019, 2, 3).toISOString(),
                            fees: {
                                fx: 1,
                                pos: 2,
                            },
                        },
                    ],
                    balancePayments: [],
                    externalLinks: [],
                    taxRate: { code: 'TAX001' } as Payhawk.ITaxRate,
                    document: {
                        number: 'INV-1',
                        files: [],
                    },
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateCreditNote(typeIsEqualSkipUndefined({
                        creditNoteNumber: expense.document!.number!,
                        date: expense.createdAt,
                        accountCode: reconciliation.accountCode,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: expense.transactions.map<XeroEntities.IPayment>(t => ({
                            amount: t.cardAmount,
                            bankAccountId,
                            currency: t.cardCurrency,
                            date: t.settlementDate!,
                            fxFees: t.fees.fx,
                            posFees: t.fees.pos,
                        })),
                        totalAmount: 4,
                        files,
                        lineItems: [{
                            amount: 4,
                            taxAmount: reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                    })))
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
                                url: `https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=/AccountsPayable/ViewCreditNote.aspx?creditNoteId=1`,
                            }],
                        }));

                await manager.exportExpense(expenseId);
            });
        });

        describe('non-card', () => {
            test('creates a bill when expense has no transactions', async () => {
                const expenseId = 'expenseId';
                const expense: Payhawk.IExpense = {
                    id: expenseId,
                    createdAt: new Date(2019, 2, 2).toISOString(),
                    note: 'Expense Note',
                    ownerName: 'John Smith',
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    isReadyForReconciliation: true,
                    paymentData: {},
                    title: 'My Cash Expense',
                    transactions: [],
                    balancePayments: [],
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        bankAccountId: undefined,
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        paymentDate: undefined,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        taxType: 'TAX001',
                        currency: reconciliation.expenseCurrency!,
                        reference: `expense-${expenseId}`,
                        fxRate: undefined,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        payments: [],
                        totalAmount: 11.28,
                        files,
                        lineItems: [{
                            amount: 11.28,
                            taxAmount: reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    })))
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
                    isReadyForReconciliation: true,
                    reconciliation,
                    supplier,
                    recipient: supplier,
                    document: { files: [] },
                    paymentData: {},
                    title: 'My Cash Expense',
                    transactions: [],
                    balancePayments: [],
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.createdAt,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency!,
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        reference: `expense-${expenseId}`,
                        totalAmount: 11.28,
                        payments: [],
                        files,
                        lineItems: [{
                            amount: 11.28,
                            taxAmount: reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    })))
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
                    recipient: supplier,
                    paymentData: {
                        dueDate: new Date(2019, 2, 12).toISOString(),
                    },
                    isReadyForReconciliation: true,
                    title: 'My Cash Expense',
                    transactions: [],
                    balancePayments: [],
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
                    .setup(x => x.getContactForRecipient(supplier))
                    .returns(async () => contactId);

                xeroEntitiesMock
                    .setup(e => e.getOrganisation())
                    .returns(async () => ({} as XeroEntities.IOrganisation))
                    .verifiable(TypeMoq.Times.once());

                xeroEntitiesMock
                    .setup(x => x.createOrUpdateBill(typeIsEqualSkipUndefined({
                        date: expense.createdAt,
                        dueDate: expense.paymentData.dueDate || expense.createdAt,
                        isPaid: expense.isPaid,
                        accountCode: reconciliation.accountCode,
                        currency: reconciliation.expenseCurrency!,
                        payments: [],
                        contactId,
                        description: `${expense.ownerName} | ${expense.note}`,
                        totalAmount: 11.28,
                        reference: `expense-${expenseId}`,
                        files,
                        lineItems: [{
                            amount: 11.28,
                            taxAmount: expense.reconciliation.expenseTaxAmount,
                            accountCode: reconciliation.accountCode,
                            taxType: expense.taxRate?.code,
                        }],
                        url: `${portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(accountId)}`,
                    })))
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

            await manager.disconnectBankFeed();
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

            await manager.disconnectBankFeed();
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

            await manager.disconnectBankFeed();
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
        it('should calculate correctly with fees', () => {
            const result = getTransactionTotalAmount({ cardAmount: 336.1400, fees: { fx: 3.03, pos: 0 } } as any);
            expect(result).toEqual(339.17);
        });

        it('should calculate correctly without fees', () => {
            const result = getTransactionTotalAmount({ cardAmount: 5.94, fees: { fx: 0, pos: 0 } } as any);
            expect(result).toEqual(5.94); // 5.9399999999999995 was received prior to fix
        });
    });
});
