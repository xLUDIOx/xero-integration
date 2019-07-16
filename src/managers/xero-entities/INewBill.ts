import { Payhawk } from '../../services';

export interface INewBill {
    contactId: string;
    description?: string;
    currency: string;
    totalAmount: number;
    accountCode?: string;
    files: Payhawk.IDownloadedFile[];
}
