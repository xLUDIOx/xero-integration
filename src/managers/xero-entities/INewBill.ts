import { Payhawk } from '../../services';

export interface INewBill {
    date: string;
    dueDate?: string;
    contactId: string;
    description?: string;
    currency: string;
    totalAmount: number;
    accountCode?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
}
