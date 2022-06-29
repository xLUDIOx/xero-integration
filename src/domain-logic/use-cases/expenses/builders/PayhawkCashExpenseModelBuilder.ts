import { IValidatedExpense } from '../validation';
import { ExpenseLinesBuilder } from './common';
import {
    IPayhawkExpenseModel,
    IPayhawkExpenseModelBuilder,
    IPayhawkExpenseReconciliationModel,
} from './contracts';

export class PayhawkCashExpenseModelBuilder implements IPayhawkExpenseModelBuilder {
    async build(payhawkExpense: IValidatedExpense): Promise<IPayhawkExpenseModel> {
        const expenseReconciliation: IPayhawkExpenseReconciliationModel = {
            currency: payhawkExpense.reconciliation.expenseCurrency,
            totalAmount: payhawkExpense.reconciliation.expenseTotalAmount,
        };

        return {
            date: payhawkExpense.document?.date || payhawkExpense.createdAt,
            expenseId: payhawkExpense.id,
            expenseOwner: payhawkExpense.owner,
            supplier: payhawkExpense.supplier,
            note: payhawkExpense.note,
            reconciliation: expenseReconciliation,
            document: payhawkExpense.document,
            payments: [],
            lines: ExpenseLinesBuilder.fromExpense({
                payhawkExpense,
                expenseReconciliation,
                useReconciliationCurrency: true,
            }),
        };
    }
}
