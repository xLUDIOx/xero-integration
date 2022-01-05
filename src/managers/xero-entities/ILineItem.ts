import { Xero } from '@services';

export interface ILineItem {
    amount: number;
    taxAmount?: number;
    taxType?: string;
    accountCode?: string;
    trackingCategories?: Xero.ITrackingCategoryValue[];
}
