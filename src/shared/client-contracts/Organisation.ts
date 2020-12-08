import { Currency } from './Currency';

export interface IOrganisation {
    organisationID: string;
    name: string;
    class: OrganisationType;
    baseCurrency: Currency,
    shortCode: string;
    isDemoCompany: boolean;

    /**
     * Formatted like /Date()/
     */
    endOfYearLockDate?: string;

    /**
     * Formatted like /Date()/
     */
    periodLockDate?: string;
}

export enum OrganisationType {
    Demo = 'DEMO',
    Trial = 'TRIAL',
    Starter = 'STARTER',
    Standard = 'STANDARD',
    Premium = 'PREMIUM',
    Premium20 = 'PREMIUM_20',
    Premium50 = 'PREMIUM_50',
    Premium100 = 'PREMIUM_100',
}
