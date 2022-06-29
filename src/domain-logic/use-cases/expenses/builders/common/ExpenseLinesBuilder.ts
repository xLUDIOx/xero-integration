import { Optional } from '@payhawk/typescript-common-types';

import {
    multiplyAmounts,
    sumAmounts,
} from '../../../../utils';
import { IValidatedExpense } from '../../validation';
import {
    IExpenseLineModel,
    IPayhawkExpenseReconciliationModel,
} from '../contracts';
import { CustomClassesBuilder } from './CustomClassesBuilder';

export class ExpenseLinesBuilder {
    static fromExpense({ payhawkExpense, expenseReconciliation, fxRate, useReconciliationCurrency }: IExpenseLinesBuilderParams): IExpenseLineModel[] {
        if (!payhawkExpense.lineItems || payhawkExpense.lineItems.length === 0) {
            return [{
                reconciliation: {
                    totalAmount: expenseReconciliation.totalAmount,
                    taxAmount: expenseReconciliation.taxAmount,
                    accountCode: payhawkExpense.reconciliation.accountCode,
                    taxCode: payhawkExpense.taxRate?.code,
                },
                customClasses: CustomClassesBuilder.fromCustomFields(payhawkExpense.reconciliation.customFields2),
            }];
        }

        let remainingTotalAmount = expenseReconciliation.totalAmount;

        const result: IExpenseLineModel[] = [];

        for (const l of payhawkExpense.lineItems) {
            let lineTotalAmount: number;
            let lineTaxAmount: Optional<number>;
            if (useReconciliationCurrency || !fxRate) {
                lineTotalAmount = l.reconciliation.expenseTotalAmount;
                lineTaxAmount = l.reconciliation.expenseTaxAmount;
            } else {
                lineTotalAmount = multiplyAmounts(l.reconciliation.expenseTotalAmount, fxRate);
                lineTaxAmount = l.reconciliation.expenseTaxAmount !== undefined ?
                    multiplyAmounts(l.reconciliation.expenseTaxAmount, fxRate) :
                    undefined;
            }

            result.push({
                reconciliation: {
                    totalAmount: lineTotalAmount,
                    taxAmount: lineTaxAmount,
                    accountCode: l.reconciliation.accountCode,
                    taxCode: l.taxRate?.code,
                },
                customClasses: CustomClassesBuilder.fromCustomFields(l.reconciliation.customFields2),
            });

            remainingTotalAmount = sumAmounts(remainingTotalAmount, -lineTotalAmount);
        }

        if (remainingTotalAmount !== 0) {
            const randomLine = result[0];
            randomLine.reconciliation.totalAmount = sumAmounts(randomLine.reconciliation.totalAmount, remainingTotalAmount);
        }

        return result;
    }
}

export type IExpenseLinesBuilderParams = {
    payhawkExpense: IValidatedExpense;
    useReconciliationCurrency: true;
    expenseReconciliation: IPayhawkExpenseReconciliationModel;
    fxRate?: undefined;
} | {
    payhawkExpense: IValidatedExpense;
    useReconciliationCurrency: boolean;
    expenseReconciliation: IPayhawkExpenseReconciliationModel;
    fxRate: number;
};
