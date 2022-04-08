import { Payhawk } from '@services';
import { Optional, RequiredBy } from '@shared';

export interface IValidatedExpense extends Payhawk.IExpense {
    reconciliation: IValidatedReconciliation;
    lineItems: Optional<IValidatedLineItem[]>;
    recipient: IValidatedRecipient;
}

export type IValidatedReconciliation = RequiredBy<Payhawk.IReconciliation, 'expenseTotalAmount' | 'expenseCurrency'>;

export interface IValidatedLineItem extends Payhawk.ILineItem {
    reconciliation: IValidatedReconciliation;
}

export type IValidatedRecipient = RequiredBy<Payhawk.IRecipient, 'name'>;
