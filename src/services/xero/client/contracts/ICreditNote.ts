import { CreditNote } from 'xero-node';

import { RequiredNonNullBy } from '@shared';

import { IPayment } from './IPayment';

export interface ICreditNote extends RequiredNonNullBy<CreditNote, 'creditNoteID'> {
    payments?: IPayment[];
};

export const CreditNoteStatus = CreditNote.StatusEnum;
