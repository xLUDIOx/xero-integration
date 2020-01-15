import { Payhawk } from '../../services';

export interface INewBill {
    bankAccountId?: string;
    date: string;
    dueDate?: string;
    isPaid?: boolean;
    contactId: string;
    description?: string;
    currency: string;
    totalAmount: number;
    accountCode?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
}
