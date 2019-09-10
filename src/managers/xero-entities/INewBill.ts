import { Payhawk } from '../../services';

export interface INewBill {
    date: string;
    contactId: string;
    description?: string;
    currency: string;
    totalAmount: number;
    accountCode?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
}
