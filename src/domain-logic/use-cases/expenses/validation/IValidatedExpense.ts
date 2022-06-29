import { Payhawk } from '@payhawk/external-integration-service-contracts';
import {
    Optional,
    RequiredBy,
} from '@shared';

export type IValidatedReconciliation = RequiredBy<Payhawk.IReconciliation, 'expenseTotalAmount' | 'expenseCurrency'>;

export interface IValidatedLineItem extends Payhawk.ILineItem {
    reconciliation: IValidatedReconciliation;
}

export type IValidatedSupplier = RequiredBy<Payhawk.ISupplier, 'name'>;

export interface IValidatedExpense extends Payhawk.IExpense {
    reconciliation: IValidatedReconciliation;
    lineItems: Optional<IValidatedLineItem[]>;
    supplier: IValidatedSupplier;
}
