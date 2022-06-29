import {
    createErrorResult,
    createSuccessResult,
    IResult,
} from '@payhawk/api-service-utils';
import { Payhawk } from '@payhawk/external-integration-service-contracts';

import { sumAmounts } from '../../../utils';
import {
    IValidatedExpense,
    IValidatedLineItem,
} from './IValidatedExpense';

export class ExpenseValidator {
    constructor(private readonly expense: Payhawk.IExpense) { }

    validate(): IResult<IValidatedExpense, ExpenseValidationError> {
        if (this.expense.isLocked) {
            return createErrorResult(ExpenseValidationError.ExpenseLocked);
        }

        if (!this.expense.isReadyForReconciliation) {
            return createErrorResult(ExpenseValidationError.ExpenseNotReady);
        }

        if (!this.expense.reconciliation.expenseCurrency) {
            return createErrorResult(ExpenseValidationError.MissingCurrency);
        }

        if (this.expense.expenseType === Payhawk.ExpenseType.Card && this.expense.payments.length === 0) {
            return createErrorResult(ExpenseValidationError.CardExpenseMissingTransaction);
        }

        if (this.expense.reconciliation.expenseTotalAmount === undefined) {
            return createErrorResult(ExpenseValidationError.MissingTotalAmount);
        }

        if (this.expense.reconciliation.expenseTotalAmount === 0 && this.expense.payments.length === 0) {
            return createErrorResult(ExpenseValidationError.MissingTotalAmount);
        }

        if (!this.expense.supplier || !this.expense.supplier.name) {
            return createErrorResult(ExpenseValidationError.MissingSupplier);
        }

        const validateLineItemsResult = this.validateLineItemProperties();
        if (validateLineItemsResult.error) {
            return validateLineItemsResult;
        }

        const validatedLineItems = validateLineItemsResult.result;

        const lineItemsSum = validatedLineItems.length > 0 ?
            sumAmounts(...validatedLineItems.map(x => x.reconciliation.expenseTotalAmount)) :
            0;

        if (lineItemsSum > 0 && lineItemsSum !== this.expense.reconciliation.expenseTotalAmount) {
            return createErrorResult(ExpenseValidationError.LineItemsSumDoesNotMatchTotalAmount);
        }

        return createSuccessResult(this.expense as IValidatedExpense);
    }

    private validateLineItemProperties(): IResult<IValidatedLineItem[], ExpenseValidationError.MissingAmountOnLineItems | ExpenseValidationError.MissingCurrencyOnLineItems> {
        const hasMissingCurrencyInLineItems = this.expense.lineItems?.some(l => !l.reconciliation.expenseCurrency);
        if (hasMissingCurrencyInLineItems) {
            return createErrorResult(ExpenseValidationError.MissingCurrencyOnLineItems);
        }

        const hasMissingTotalAmountInLineItems = this.expense.lineItems?.some(l => !l.reconciliation.expenseTotalAmount);
        if (hasMissingTotalAmountInLineItems) {
            return createErrorResult(ExpenseValidationError.MissingAmountOnLineItems);
        }

        return createSuccessResult((this.expense.lineItems || []) as IValidatedLineItem[]);
    }
}

export enum ExpenseValidationError {
    ExpenseLocked = 'expense-locked',
    ExpenseNotReady = 'expense-not-ready',

    CardExpenseMissingTransaction = 'card-expense-missing-transaction',
    MissingCurrency = 'missing-currency',
    MissingTotalAmount = 'missing-total-amount',
    MissingSupplier = 'missing-supplier',
    MissingCurrencyOnLineItems = 'missing-currency-line-items',
    MissingAmountOnLineItems = 'missing-amount-line-items',
    LineItemsSumDoesNotMatchTotalAmount = 'line-items-sum-does-not-match-amount',
}
