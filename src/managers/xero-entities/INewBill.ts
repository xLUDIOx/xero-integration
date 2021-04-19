import { Payhawk, Xero } from '@services';

export interface INewBill {
    date: string;
    dueDate: string;
    isPaid?: boolean;
    contactId: string;
    description?: string;
    reference?: string;
    currency: string;
    fxRate?: number;
    totalAmount: number;
    accountCode?: string;
    taxType?: string;
    files: Payhawk.IDownloadedFile[];
    url: string;

    paymentData?: IPaymentData[];

    trackingCategories?: Xero.ITrackingCategoryValue[];
}

export interface IPaymentData {
    bankAccountId: string;
    date: string;
    amount: number;
    fxFees?: number;
    posFees?: number;
    bankFees?: number;
    currency: string;
}
