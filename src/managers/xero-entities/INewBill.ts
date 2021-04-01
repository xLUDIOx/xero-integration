import { Payhawk } from '../../services';
import { ITrackingCategoryValue } from '../../services/xero';

export interface INewBill {
    bankAccountId?: string;
    date: string;
    dueDate: string;
    paymentDate?: string;
    isPaid?: boolean;
    contactId: string;
    description?: string;
    currency: string;
    fxRate?: number;
    totalAmount: number;
    accountCode?: string;
    taxType?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;
    trackingCategories?: ITrackingCategoryValue[];
}
