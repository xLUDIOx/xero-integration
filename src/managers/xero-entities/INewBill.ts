import { Payhawk, Xero } from '@services';

import { ILineItem } from './ILineItem';
import { IPaymentData } from './IPaymentData';

export interface INewBill {
    date: string;
    dueDate: string;
    isPaid?: boolean;
    contactId: string;
    description?: string;
    reference?: string;
    currency: string;
    files: Payhawk.IDownloadedFile[];
    url: string;

    lineItems?: ILineItem[];

    paymentData?: IPaymentData[];

    // TODO: Remove
    totalAmount: number;
    taxType?: string;
    accountCode?: string;
    trackingCategories?: Xero.ITrackingCategoryValue[];
}
