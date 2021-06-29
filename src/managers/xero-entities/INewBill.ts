import { Payhawk, Xero } from '@services';

import { ILineItem } from './ILineItem';
import { IPayment } from './IPaymentData';

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

    payments?: IPayment[];

    // TODO: Remove
    totalAmount: number;
    taxType?: string;
    accountCode?: string;
    trackingCategories?: Xero.ITrackingCategoryValue[];
}
