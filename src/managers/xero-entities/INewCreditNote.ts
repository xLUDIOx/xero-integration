import { Payhawk, Xero } from '@services';

import { IPaymentData } from './IPaymentData';

export interface INewCreditNote {
    creditNoteNumber: string;
    contactId: string;
    currency: string;
    date: string,
    totalAmount: number;
    description?: string;
    accountCode?: string;
    taxType?: string;
    files: Payhawk.IDownloadedFile[];
    paymentData: IPaymentData[];
    trackingCategories?: Xero.ITrackingCategoryValue[];
}
