import { Payhawk } from '../../services';

export interface INewBill {
    bankAccountId?: string;
    date: string;
    dueDate?: string;
    isPaid?: boolean;
    contactId: string;
    description?: string;
    currency: string;
    fxRate?: number;
    totalAmount: number;
    accountCode?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
}
