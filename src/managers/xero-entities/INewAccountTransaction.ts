import { Payhawk } from '../../services';

export interface INewAccountTransaction {
    date: string;
    bankAccountId: string;
    contactId: string;
    description?: string;
    reference: string;
    amount: number;
    fxFees: number;
    posFees: number;
    accountCode?: string;
    taxType?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
}
