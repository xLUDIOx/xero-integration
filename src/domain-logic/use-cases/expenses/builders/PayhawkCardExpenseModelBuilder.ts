import { Payhawk } from '@payhawk/external-integration-service-contracts';

import {
    calculateConversionRate,
    multiplyAmounts,
    sumAmounts,
} from '../../../utils';
import { IValidatedExpense } from '../validation';
import { ExpenseLinesBuilder } from './common';
import {
    IExpenseModelBuilderParams,
    IPayhawkExpenseModel,
    IPayhawkExpenseModelBuilder,
    IPayhawkExpensePaymentModel,
    IPayhawkExpenseReconciliationModel,
} from './contracts';

export class PayhawkCardExpenseModelBuilder implements IPayhawkExpenseModelBuilder {
    constructor(
        private readonly params: IExpenseModelBuilderParams,
    ) { }

    async build(payhawkExpense: IValidatedExpense): Promise<IPayhawkExpenseModel> {
        const transaction = payhawkExpense.payments[0];

        const transactionCurrency = transaction.currency;
        const expenseCurrency = payhawkExpense.reconciliation.expenseCurrency;
        const baseCurrency = this.params.baseCurrency;

        const expenseAmount = payhawkExpense.reconciliation.expenseTotalAmount;

        const transactionsTotalAmount = sumAmounts(...payhawkExpense.payments.map(t => t.amount));

        let fxRate: number;
        let reverseFxRate: number;
        let exportCurrency;
        let exportTotalAmount;
        let exportTaxAmount;

        const useExpenseCurrency = transactionCurrency === baseCurrency;
        if (useExpenseCurrency) {
            fxRate = calculateConversionRate({ from: expenseAmount, to: transactionsTotalAmount });
            reverseFxRate = calculateConversionRate({ from: transactionsTotalAmount, to: expenseAmount });

            exportCurrency = expenseCurrency;
            exportTotalAmount = expenseAmount;
            exportTaxAmount = payhawkExpense.reconciliation.expenseTaxAmount;
        } else {
            reverseFxRate = 1;
            fxRate = 1;

            exportCurrency = transactionCurrency;
            exportTotalAmount = transactionsTotalAmount;

            const paymentToExpenseFxRate = calculateConversionRate({ from: expenseAmount, to: transactionsTotalAmount });;
            exportTaxAmount = payhawkExpense.reconciliation.expenseTaxAmount !== undefined ?
                multiplyAmounts(payhawkExpense.reconciliation.expenseTaxAmount, paymentToExpenseFxRate) :
                undefined;
        }

        const settledTransactions = payhawkExpense.payments.filter(t => t.status === Payhawk.ExpensePaymentStatus.Settled);
        const payments: IPayhawkExpensePaymentModel[] = [];

        if (settledTransactions.length === payhawkExpense.payments.length) {
            let remainingOriginalAmount = exportTotalAmount;
            for (const tx of payhawkExpense.payments) {
                const currentOriginalAmount = multiplyAmounts(tx.amount, reverseFxRate);
                remainingOriginalAmount = sumAmounts(remainingOriginalAmount, -currentOriginalAmount);

                const payment: IPayhawkExpensePaymentModel = {
                    id: tx.id,
                    originalAmount: currentOriginalAmount,
                    originalCurrency: exportCurrency,
                    fxRate,
                    paidAmount: tx.amount,
                    paidCurrency: tx.currency,
                    bankFees: 0,
                    fxFees: tx.fees.fx ?? 0,
                    posFees: tx.fees.pos ?? 0,
                    date: tx.date,
                    note: tx.description,
                    relatedExpenseIds: tx.expenseIds,
                };

                payments.push(payment);
            }

            if (fxRate !== 1 && remainingOriginalAmount !== 0) {
                const randomPayment = payments[0];
                randomPayment.originalAmount = sumAmounts(randomPayment.originalAmount, remainingOriginalAmount);
                randomPayment.fxRate = calculateConversionRate({
                    from: randomPayment.originalAmount,
                    to: randomPayment.paidAmount,
                });
            }
        }

        const expenseReconciliation: IPayhawkExpenseReconciliationModel = {
            currency: exportCurrency,
            totalAmount: exportTotalAmount,
            taxAmount: exportTaxAmount,
        };

        return {
            date: payhawkExpense.document?.date || payhawkExpense.createdAt,
            expenseId: payhawkExpense.id,
            expenseOwner: payhawkExpense.owner,
            supplier: payhawkExpense.supplier,
            note: payhawkExpense.note,
            reconciliation: expenseReconciliation,
            document: payhawkExpense.document,
            payments,
            lines: ExpenseLinesBuilder.fromExpense({
                payhawkExpense,
                expenseReconciliation,
                fxRate,
                useReconciliationCurrency: useExpenseCurrency,
            }),
        };
    }
}
