import { Invoice } from 'xero-node';

import { IPayment } from './IPayment';

export interface IInvoice extends Required<Pick<Invoice, 'invoiceID' | 'reference' | 'contact' | 'date' | 'amountPaid'>> {
    status: InvoiceStatus;
    payments: IInvoicePayment[] | undefined;
}

export type IInvoicePayment = Omit<IPayment, 'account'>;

export enum InvoiceStatus {
    DRAFT = 'DRAFT',
    SUBMITTED = 'SUBMITTED',
    DELETED = 'DELETED',
    AUTHORISED = 'AUTHORISED',
    PAID = 'PAID',
    VOIDED = 'VOIDED'
}
