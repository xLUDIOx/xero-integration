import { Payhawk, Xero } from '@services';

import { ILineItem } from './ILineItem';
import { IPaymentData } from './IPaymentData';

export interface INewCreditNote {
    creditNoteNumber: string;
    contactId: string;
    currency: string;
    date: string,
    description?: string;
    files: Payhawk.IDownloadedFile[];
    paymentData: IPaymentData[];

    lineItems?: ILineItem[];

    totalAmount: number;
    accountCode?: string;
    taxType?: string;
    trackingCategories?: Xero.ITrackingCategoryValue[];
}
