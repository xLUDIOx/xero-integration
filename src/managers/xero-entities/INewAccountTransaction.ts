import { Payhawk } from '../../services';

export interface INewAccountTransaction {
    date: string;
    bankAccountId: string;
    contactId: string;
    description?: string;
    reference: string;
    totalAmount: number;
    accountCode?: string;
    taxType?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
}
