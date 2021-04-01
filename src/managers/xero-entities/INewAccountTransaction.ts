import { Payhawk } from '../../services';
import { ITrackingCategoryValue } from '../../services/xero';

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
    taxExempt?: boolean;
    files: Payhawk.IDownloadedFile[];
    url: string;
    trackingCategories?: ITrackingCategoryValue[];
}
