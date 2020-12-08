import { Currency } from '@shared';

export interface IOrganisation {
    name: string;
    baseCurrency: Currency;
    shortCode: string;
    isDemoCompany: boolean;
    endOfYearLockDate?: Date;
    periodLockDate?: Date;
}
