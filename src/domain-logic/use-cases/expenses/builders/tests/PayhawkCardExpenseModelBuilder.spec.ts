import { sumAmounts } from '../../../../utils';
import { IPayhawkExpenseModel } from '../contracts';
import { PayhawkCardExpenseModelBuilder } from '../PayhawkCardExpenseModelBuilder';
import { TestExpense } from './TestExpense';

describe(`${PayhawkCardExpenseModelBuilder.name} tests`, () => {
    const baseCurrency = 'GBP';

    describe('transaction currency === base currency', () => {
        const expenseCurrency = 'USD';
        const paymentCurrency = 'EUR';

        const builder = new PayhawkCardExpenseModelBuilder({
            baseCurrency: paymentCurrency,
        });

        let expense: TestExpense;

        beforeEach(async () => {
            expense = new TestExpense({
                taxRate: {
                    code: 'TAX001',
                    name: 'Tax Exempt',
                    rate: 0,
                },
            }).withReconciliation({
                accountCode: '100001',
                expenseCurrency,
                expenseTotalAmount: 39,
                expenseTaxAmount: 5.36,
            }).withCardTransaction({
                amount: 32.15,
                currency: paymentCurrency,
                fxRate: 0.82436,
                fees: {
                    fx: 0.29,
                    pos: 0,
                    bank: 0,
                },
            });
        });

        it('should map entity using expense currency', async () => {
            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.reconciliation).toEqual({
                currency: expenseCurrency,
                totalAmount: 39,
                taxAmount: 5.36,
            });

            expect(expenseModel.lines).toMatchObject([{
                reconciliation: {
                    accountCode: '100001',
                    taxCode: 'TAX001',
                    totalAmount: 39,
                    taxAmount: 5.36,
                },
                customClasses: [],
            }]);
        });

        it('should map payment using expense currency', async () => {
            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.payments).toHaveLength(1);
            expect(expenseModel.payments[0]).toMatchObject({
                originalAmount: 39,
                originalCurrency: expenseCurrency,
                fxRate: 0.82435897,
                paidAmount: 32.15,
                paidCurrency: paymentCurrency,
                bankFees: 0,
                fxFees: 0.29,
                posFees: 0,
            });
        });

        it('should handle rounding errors for payment using expense currency', async () => {
            expense.withReconciliation({
                accountCode: '100001',
                expenseCurrency,
                expenseTotalAmount: 394.73,
                expenseTaxAmount: 5.36,
            }).withCardTransaction({
                amount: 89.66,
                currency: paymentCurrency,
                fxRate: 0.82436,
                fees: {
                    fx: 0.31,
                    pos: 0,
                    bank: 0,
                },
            });

            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.payments).toHaveLength(2);
            expect(sumAmounts(expenseModel.payments[0].originalAmount, expenseModel.payments[1].originalAmount)).toEqual(394.73);
            expect(expenseModel.payments[0].fxRate).not.toEqual(expenseModel.payments[1].fxRate);
        });

        it('should map refund payment using expense currency', async () => {
            expense.withReconciliation({
                accountCode: '100001',
                expenseCurrency,
                expenseTotalAmount: 58.13,
                expenseTaxAmount: 5.36,
            }).withCardTransaction({
                amount: -9.66,
                currency: paymentCurrency,
                fxRate: 0.82436,
                fees: {
                    fx: 0.31,
                    pos: 0,
                    bank: 0,
                },
            });

            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.payments).toHaveLength(2);
            expect(sumAmounts(expenseModel.payments[0].originalAmount, expenseModel.payments[1].originalAmount)).toEqual(58.13);
            expect(expenseModel.payments[0].paidAmount).toEqual(32.15);
            expect(expenseModel.payments[1].paidAmount).toEqual(-9.66);
        });

        it('should map line items', async () => {
            expense.withLineItem({
                reconciliation: {
                    expenseCurrency,
                    expenseTotalAmount: 30,
                    expenseTaxAmount: 3,
                    accountCode: '101',
                } as any,
            }).withLineItem({
                reconciliation: {
                    expenseCurrency,
                    expenseTotalAmount: 9,
                    expenseTaxAmount: 2.36,
                    accountCode: '102',
                } as any,
            });

            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.lines).toMatchObject([{
                reconciliation: {
                    accountCode: '101',
                    taxAmount: 3,
                    totalAmount: 30,
                    taxCode: 'TAX003',
                },
            }, {
                reconciliation: {
                    accountCode: '102',
                    taxAmount: 2.36,
                    totalAmount: 9,
                    taxCode: 'TAX003',
                },
            }]);
        });
    });

    describe('expense currency === transaction currency', () => {
        let expenseModel: IPayhawkExpenseModel;

        const currency = 'EUR';

        const builder = new PayhawkCardExpenseModelBuilder({
            baseCurrency,
        });

        beforeEach(async () => {
            const expense = new TestExpense({
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
                    expenseTaxAmount: 12.25,
                })
                .withCardTransaction({
                    amount: 100,
                    currency,
                })
                .withCardTransaction({
                    amount: 50,
                    currency,
                })
                .build();

            expenseModel = await builder.build(expense);
        });

        it('should map entity', () => {
            expect(expenseModel.reconciliation).toEqual({
                currency: 'EUR',
                taxAmount: 12.25,
                totalAmount: 150,
            });

            expect(expenseModel.lines).toMatchObject([{
                reconciliation: {
                    accountCode: '200002',
                    taxCode: 'TAX001',
                    taxAmount: 12.25,
                    totalAmount: 150,
                },
                customClasses: [],
            }]);
        });

        it('should map separate payments', async () => {
            expect(expenseModel.payments).toHaveLength(2);
            expect(expenseModel.payments[0]).toMatchObject({
                originalAmount: 100,
                originalCurrency: 'EUR',
                fxRate: 1,
                paidAmount: 100,
                paidCurrency: 'EUR',
                bankFees: 0,
                fxFees: 0,
                posFees: 0,
            });

            expect(expenseModel.payments[1]).toMatchObject({
                originalAmount: 50,
                originalCurrency: 'EUR',
                fxRate: 1,
                paidAmount: 50,
                paidCurrency: 'EUR',
                bankFees: 0,
                fxFees: 0,
                posFees: 0,
            });
        });
    });

    describe('expense currency !== transaction currency !== baseCurrency', () => {
        const expenseCurrency = 'USD';
        const paymentCurrency = 'EUR';

        const builder = new PayhawkCardExpenseModelBuilder({
            baseCurrency,
        });

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
                    expenseTotalAmount: 39,
                    expenseTaxAmount: 2,
                })
                .withCardTransaction({
                    amount: 32.15,
                    currency: paymentCurrency,
                    fxRate: 0.82436,
                    fees: {
                        fx: 0.29,
                        pos: 0,
                        bank: 0,
                    },
                });
        });

        it('should map entity using transaction currency', async () => {
            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.reconciliation).toEqual({
                currency: 'EUR',
                taxAmount: 1.65,
                totalAmount: 32.15,
            });

            expect(expenseModel.lines).toMatchObject([{
                reconciliation: {
                    accountCode: '200002',
                    taxCode: 'TAX001',
                    taxAmount: 1.65,
                    totalAmount: 32.15,
                },
                customClasses: [],
            }]);
        });

        it('should map payment using transaction currency', async () => {
            const expenseModel = await builder.build(expense.build());
            expect(expenseModel.payments).toHaveLength(1);
            expect(expenseModel.payments[0]).toMatchObject({
                originalAmount: 32.15,
                originalCurrency: 'EUR',
                fxRate: 1,
                paidAmount: 32.15,
                paidCurrency: 'EUR',
                bankFees: 0,
                fxFees: 0.29,
                posFees: 0,
            });
        });

        it('should map line items', async () => {
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
                    expenseTotalAmount: 4392.71,
                    expenseTaxAmount: 129.63,
                })
                .withCardTransaction({
                    amount: 3621.17,
                    currency: paymentCurrency,
                    fxRate: 0.82436,
                    fees: {
                        fx: 0.29,
                        pos: 0,
                        bank: 0,
                    },
                })
                .withLineItem({
                    reconciliation: {
                        expenseCurrency,
                        expenseTotalAmount: 2767.40,
                        expenseTaxAmount: 81.67,
                        accountCode: '101',
                    } as any,
                })
                .withLineItem({
                    reconciliation: {
                        expenseCurrency,
                        expenseTotalAmount: 1625.30,
                        expenseTaxAmount: 47.96,
                        accountCode: '102',
                    } as any,
                });

            const paymentAmount = 3621.17;

            const expenseModel = await builder.build(expense.build());
            expect(sumAmounts(
                ...expenseModel.lines.map(l => l.reconciliation.totalAmount)
            )).toEqual(paymentAmount);
        });
    });
});
