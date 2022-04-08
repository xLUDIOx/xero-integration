import { Payhawk } from '@services';
import {
    createErrorResult,
    createSuccessResult,
    IResult,
} from '@utils';

import { IValidatedExpense } from './IValidatedExpense';

export class ExpenseValidator {
    constructor(private readonly expense: Payhawk.IExpense) { }

    validate(): IResult<IValidatedExpense, ExpenseValidationError> {
        if (this.expense.isLocked) {
            return createErrorResult(ExpenseValidationError.ExpenseLocked);
        }

        if (!this.expense.isReadyForReconciliation) {
            createErrorResult(ExpenseValidationError.ExpenseNotReady);
        }

        if (!this.expense.reconciliation.expenseCurrency) {
            return createErrorResult(ExpenseValidationError.MissingCurrency);
        }

        if (!this.expense.reconciliation.expenseTotalAmount && this.expense.transactions.length === 0) {
            return createErrorResult(ExpenseValidationError.MissingTotalAmount);
        }

        if (!this.expense.recipient || !this.expense.recipient.name) {
            return createErrorResult(ExpenseValidationError.MissingSupplier);
        }

        const hasMissingCurrencyInLineItems = this.expense.lineItems?.some(l => !l.reconciliation.expenseCurrency);
        if (hasMissingCurrencyInLineItems) {
            return createErrorResult(ExpenseValidationError.MissingCurrencyOnLineItems);
        }

        const hasMissingTotalAmountInLineItems = this.expense.lineItems?.some(l => !l.reconciliation.expenseTotalAmount);
        if (hasMissingTotalAmountInLineItems) {
            return createErrorResult(ExpenseValidationError.MissingAmountOnLineItems);
        }

        return createSuccessResult(this.expense as IValidatedExpense);
    }
}

export enum ExpenseValidationError {
    ExpenseLocked = 'expense-locked',
    ExpenseNotReady = 'expense-not-ready',
    MissingCurrency = 'missing-currency',
    MissingTotalAmount = 'missing-total-amount',
    MissingSupplier = 'missing-supplier',
    MissingCurrencyOnLineItems = 'missing-currency-line-items',
    MissingAmountOnLineItems = 'missing-amount-line-items',
}
