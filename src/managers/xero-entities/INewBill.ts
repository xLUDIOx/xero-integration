import { Payhawk, Xero } from '@services';

import { IPaymentData } from './IPaymentData';

export interface INewBill {
    date: string;
    dueDate: string;
    isPaid?: boolean;
    contactId: string;
    description?: string;
    reference?: string;
    currency: string;
    totalAmount: number;
    accountCode?: string;
    taxType?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;

    paymentData?: IPaymentData[];

    trackingCategories?: Xero.ITrackingCategoryValue[];
}
