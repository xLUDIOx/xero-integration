import { Invoice } from 'xero-node';

export type IInvoice = Required<Pick<Invoice, 'invoiceID' | 'status'>>;
