import { PayhawkReimbursableExpenseModelBuilder } from '../PayhawkReimbursableExpenseModelBuilder';
import { TestExpense } from './TestExpense';

import '@payhawk/api-service-utils/build/extension-methods';

describe(`${PayhawkReimbursableExpenseModelBuilder.name} tests`, () => {
    describe('base currency === payment currency', () => {
        describe('expense currency === payment currency', () => {
            const currency = 'EUR';

            const builder = new PayhawkReimbursableExpenseModelBuilder(
                {
                    baseCurrency: currency,
                },
                {} as any,
            );

            let expense: TestExpense;

            beforeEach(async () => {
                expense = new TestExpense({
                    taxRate: {
                        code: 'TAX001',
                        name: 'Tax Exempt',
                        rate: 0,
                    },
                })
                    .withReconciliation({
                        accountCode: '200002',
                        expenseCurrency: currency,
                        expenseTotalAmount: 150,
                        expenseTaxAmount: 0,
                    });
            });

            describe('single expense paid', () => {
                beforeEach(() => {
                    expense = expense.withBankPayment({
                        amount: 150,
                        currency,
                    });
                });

                it('should map entity', async () => {
                    const expenseModel = await builder.build(expense.build());
                    expect(expenseModel.reconciliation).toEqual({
                        currency: 'EUR',
                        totalAmount: 150,
                    });

                    expect(expenseModel.lines).toMatchObject([{
                        reconciliation: {
                            accountCode: '200002',
                            totalAmount: 150,
                        },
                        customClasses: [],
                    }]);
                });

                it('should map separate payments', async () => {
                    const expenseModel = await builder.build(expense.build());
                    expect(expenseModel.payments[0]).toMatchObject({
                        originalAmount: 150,
                        originalCurrency: 'EUR',
                        fxRate: 1,
                        paidAmount: 150,
                        paidCurrency: 'EUR',
                        bankFees: 0,
                        fxFees: 0,
                        posFees: 0,
                    });
                });
            });

            it('should map bulk payment', async () => {
                expense
                    .withReconciliation({
                        accountCode: '200002',
                        expenseCurrency: currency,
                        expenseTotalAmount: 100,
                        expenseTaxAmount: 0,
                    })
                    .withBankPayment({
                        amount: 150,
                        currency,
                        expenseIds: ['1', '2'],
                        fxRate: 1,
                    });

                const expenseModel = await builder.build(expense.build());
                expect(expenseModel.reconciliation).toMatchObject({
                    currency,
                    totalAmount: 100,
                });

                expect(expenseModel.payments[0]).toMatchObject({
                    originalAmount: 100,
                    originalCurrency: 'EUR',
                    fxRate: 1,
                    paidAmount: 150,
                    paidCurrency: 'EUR',
                    bankFees: 0,
                    fxFees: 0,
                    posFees: 0,
                    relatedExpenseIds: ['1', '2'],
                });
            });
        });

        describe('expense currency !== payment currency', () => {
            const currency = 'EUR';

            const builder = new PayhawkReimbursableExpenseModelBuilder(
                {
                    baseCurrency: currency,
                },
                {} as any,
            );

            let expense: TestExpense;

            beforeEach(async () => {
                expense = new TestExpense({
                    taxRate: {
                        code: 'TAX001',
                        name: 'Tax Exempt',
                        rate: 0,
                    },
                })
                    .withReconciliation({
                        accountCode: '200002',
                        expenseCurrency: 'GBP',
                        expenseTotalAmount: 150,
                        expenseTaxAmount: 0,
                    });
            });

            describe('single expense paid', () => {
                beforeEach(() => {
                    expense = expense.withBankPayment({
                        amount: 200,
                        currency,
                    });
                });

                it('should map entity', async () => {
                    const expenseModel = await builder.build(expense.build());
                    expect(expenseModel.reconciliation).toEqual({
                        currency: 'GBP',
                        totalAmount: 150,
                    });

                    expect(expenseModel.lines).toMatchObject([{
                        reconciliation: {
                            accountCode: '200002',
                            totalAmount: 150,
                        },
                        customClasses: [],
                    }]);
                });

                it('should map separate payments', async () => {
                    const expenseModel = await builder.build(expense.build());
                    expect(expenseModel.payments[0]).toMatchObject({
                        originalAmount: 150,
                        originalCurrency: 'GBP',
                        fxRate: 1.33333333,
                        paidAmount: 200,
                        paidCurrency: 'EUR',
                        bankFees: 0,
                        fxFees: 0,
                        posFees: 0,
                    });
                });
            });

            it('should map bulk payment', async () => {
                expense
                    .withReconciliation({
                        accountCode: '200002',
                        expenseCurrency: 'GBP',
                        expenseTotalAmount: 50,
                        expenseTaxAmount: 0,
                    })
                    .withBankPayment({
                        amount: 150,
                        currency,
                        expenseIds: ['1', '2'],
                        fxRate: 1.25,
                    });

                const expenseModel = await builder.build(expense.build());
                expect(expenseModel.reconciliation).toMatchObject({
                    currency: 'GBP',
                    totalAmount: 50,
                });

                expect(expenseModel.payments[0]).toMatchObject({
                    originalAmount: 50,
                    originalCurrency: 'GBP',
                    fxRate: 1.25,
                    paidAmount: 150,
                    paidCurrency: 'EUR',
                    bankFees: 0,
                    fxFees: 0,
                    posFees: 0,
                    relatedExpenseIds: ['1', '2'],
                });
            });
        });
    });

    describe('base currency !== payment currency', () => {
        const baseCurrency = 'GBP';
        const paymentCurrency = 'EUR';

        describe('expense currency !== payment currency', () => {
            const expenseCurrency = 'BGN';

            const builder = new PayhawkReimbursableExpenseModelBuilder(
                {
                    baseCurrency,
                },
                {} as any,
            );

            let expense: TestExpense;

            beforeEach(async () => {
                expense = new TestExpense({
                    taxRate: {
                        code: 'TAX001',
                        name: 'Tax Exempt',
                        rate: 0,
                    },
                })
                    .withReconciliation({
                        accountCode: '200002',
                        expenseCurrency,
                        expenseTotalAmount: 100,
                        expenseTaxAmount: 0,
                    });
            });

            describe('single expense paid', () => {
                beforeEach(() => {
                    expense = expense.withBankPayment({
                        amount: 195.59,
                        currency: paymentCurrency,
                        fxRate: 1.95585,
                    });
                });

                it('should map entity', async () => {
                    const expenseModel = await builder.build(expense.build());
                    expect(expenseModel.reconciliation).toEqual({
                        currency: 'EUR',
                        totalAmount: 195.59,
                    });

                    expect(expenseModel.lines).toMatchObject([{
                        reconciliation: {
                            accountCode: '200002',
                            totalAmount: 195.59,
                        },
                        customClasses: [],
                    }]);
                });

                it('should map separate payments', async () => {
                    const expenseModel = await builder.build(expense.build());
                    expect(expenseModel.payments[0]).toMatchObject({
                        originalAmount: 195.59,
                        originalCurrency: 'EUR',
                        fxRate: 1.9559,
                        paidAmount: 195.59,
                        paidCurrency: 'EUR',
                        bankFees: 0,
                        fxFees: 0,
                        posFees: 0,
                    });
                });
            });

            it('should map bulk payment', async () => {
                expense
                    .withReconciliation({
                        accountCode: '200002',
                        expenseCurrency,
                        expenseTotalAmount: 51,
                        expenseTaxAmount: 0,
                    })
                    .withBankPayment({
                        amount: 843.51,
                        currency: paymentCurrency,
                        expenseIds: ['1', '2'],
                        fxRate: 1.95585,
                    });

                const expenseModel = await builder.build(expense.build());
                expect(expenseModel.reconciliation).toMatchObject({
                    currency: 'EUR',
                    totalAmount: 99.75,
                });

                expect(expenseModel.payments[0]).toMatchObject({
                    originalAmount: 99.75,
                    originalCurrency: 'EUR',
                    fxRate: 1.95585,
                    paidAmount: 843.51,
                    paidCurrency: 'EUR',
                    bankFees: 0,
                    fxFees: 0,
                    posFees: 0,
                    relatedExpenseIds: ['1', '2'],
                });
            });
        });
    });
});
