import { CurrencyCode } from 'xero-node';

export interface IOrganisation {
    name: string;
    baseCurrency: CurrencyCode;
    shortCode: string;
}
