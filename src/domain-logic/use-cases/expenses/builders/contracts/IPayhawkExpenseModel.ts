import { Payhawk } from '@payhawk/external-integration-service-contracts';

import { IValidatedSupplier } from '../../validation';

export interface IPayhawkExpenseModel extends IHasLinesItems {
    expenseId: string;
    expenseOwner: Payhawk.IExpenseActor;
    document?: Payhawk.IDocument;
    date: Date;
    dueDate?: Date;
    note?: string;
    reconciliation: IPayhawkExpenseReconciliationModel;
    supplier: IValidatedSupplier;
    payments: IPayhawkExpensePaymentModel[];
}

export interface IHasLinesItems {
    lines: IExpenseLineModel[];
}

export interface IExpenseLineModel extends IHasCustomClasses {
    reconciliation: IExpenseLineReconciliationModel;
}

export interface IExpenseLineReconciliationModel {
    totalAmount: number;
    accountCode?: string;
    itemCode?: string;
    taxCode?: string;
    taxAmount?: number;
}

export interface IHasCustomClasses {
    customClasses?: ICustomClass[];
}

export interface ICustomClass {
    id: string;
    label: string;
    source?: string;
    valueId: string;
    valueLabel: string;
}

export interface IPayhawkExpensePaymentModel {
    id: string;
    originalAmount: number;
    originalCurrency: string;
    fxRate?: number;
    paidAmount: number;
    paidCurrency: string;
    date: Date;
    isFailed?: boolean;
    bankFees: number;
    fxFees: number;
    posFees: number;
    note: string;
    relatedExpenseIds: string[];
}

export interface IPayhawkExpenseReconciliationModel {
    currency: string;
    totalAmount: number;
    taxAmount?: number;
}
