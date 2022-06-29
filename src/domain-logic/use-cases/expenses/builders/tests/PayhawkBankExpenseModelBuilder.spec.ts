import { IPayhawkExpenseModel } from '../contracts';
import { PayhawkBankExpenseModelBuilder } from '../PayhawkBankExpenseModelBuilder';
import { TestExpense } from './TestExpense';

import '@payhawk/api-service-utils/build/extension-methods';

describe(`${PayhawkBankExpenseModelBuilder.name} tests`, () => {
    // const baseCurrency = 'GBP';

    describe('expense currency === payment currency', () => {
        let expenseModel: IPayhawkExpenseModel;

        const currency = 'EUR';

        const builder = new PayhawkBankExpenseModelBuilder(
            {
                baseCurrency: currency,
            },
            {} as any,
        );

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
                .withBankPayment({
                    amount: 150,
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
});
