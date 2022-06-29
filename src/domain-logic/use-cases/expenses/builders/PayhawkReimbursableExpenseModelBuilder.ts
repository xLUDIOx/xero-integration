import {
    ILogger,
    SortDirection,
} from '@payhawk/api-service-utils';
import { Payhawk } from '@payhawk/external-integration-service-contracts';

import {
    calculateConversionRate,
    multiplyAmounts,
} from '../../../utils';
import { IValidatedExpense } from '../validation';
import { ExpenseLinesBuilder } from './common';
import {
    IExpenseModelBuilderParams,
    IPayhawkExpenseModel,
    IPayhawkExpenseModelBuilder,
    IPayhawkExpenseReconciliationModel,
} from './contracts';

export class PayhawkReimbursableExpenseModelBuilder implements IPayhawkExpenseModelBuilder {
    constructor(
        private readonly params: IExpenseModelBuilderParams,
        private readonly logger: ILogger,
    ) { }

    async build(payhawkExpense: IValidatedExpense): Promise<IPayhawkExpenseModel> {
        const orderedPayments = payhawkExpense.payments.sortBy([{
            extractor: a => a.date,
            direction: SortDirection.Desc,
        }]);

        const settledPayments = orderedPayments.filter(p => p.status !== Payhawk.ExpensePaymentStatus.Failed);
        if (settledPayments.length > 1) {
            throw this.logger.e`Found multiple settled payments for reimbursable expense`;
        }

        const settledPayment = settledPayments[0];
        let expensePayment = settledPayment;
        if (!expensePayment) {
            expensePayment = orderedPayments[0];
        }

        const paymentCurrency = expensePayment?.currency;
        const expenseCurrency = payhawkExpense.reconciliation.expenseCurrency;
        const baseCurrency = this.params.baseCurrency;

        const paymentAmount = expensePayment ? expensePayment.amount : undefined;
        const expenseAmount = payhawkExpense.reconciliation.expenseTotalAmount;

        const useExpenseCurrency = !paymentCurrency || !paymentAmount || paymentCurrency === baseCurrency;

        let fxRate: number;
        let currency: string;
        let totalAmount: number;
        if (useExpenseCurrency) {
            fxRate = 1.0;

            currency = expenseCurrency;
            totalAmount = expenseAmount;
        } else {
            if (expensePayment.expenseIds.length === 1) {
                fxRate = calculateConversionRate({ from: expenseAmount, to: paymentAmount });
                currency = paymentCurrency;
                totalAmount = paymentAmount;
            } else {
                fxRate = expensePayment.fxRate;
                currency = paymentCurrency;
                totalAmount = multiplyAmounts(expenseAmount, fxRate);
            }
        }

        const expenseReconciliation: IPayhawkExpenseReconciliationModel = {
            currency,
            totalAmount,
        };

        return {
            date: payhawkExpense.document?.date || payhawkExpense.createdAt,
            expenseId: payhawkExpense.id,
            expenseOwner: payhawkExpense.owner,
            supplier: payhawkExpense.supplier,
            note: payhawkExpense.note,
            reconciliation: expenseReconciliation,
            payments: payhawkExpense.payments.map(p => {
                let paymentFxRate;
                if (p.expenseIds.length === 1) {
                    paymentFxRate = calculateConversionRate({ from: expenseAmount, to: p.amount });
                } else {
                    paymentFxRate = p.fxRate;
                }

                return {
                    id: p.id,
                    originalAmount: totalAmount,
                    originalCurrency: currency,
                    fxRate: paymentFxRate,
                    paidAmount: p.amount,
                    paidCurrency: p.currency,
                    bankFees: p.fees.bank ?? 0,
                    date: p.date,
                    fxFees: 0,
                    posFees: 0,
                    note: `Payment: ${payhawkExpense.supplier.name}`,
                    isFailed: p.status === Payhawk.ExpensePaymentStatus.Failed,
                    document: payhawkExpense.document,
                    relatedExpenseIds: p.expenseIds,
                };
            }),
            document: payhawkExpense.document,
            lines: ExpenseLinesBuilder.fromExpense({
                payhawkExpense,
                expenseReconciliation,
                fxRate,
                useReconciliationCurrency: useExpenseCurrency,
            }).map(x => ({
                ...x,
                reconciliation: {
                    ...x.reconciliation,
                    taxAmount: undefined,
                    taxCode: undefined,
                },
            })),
        };
    }
}
