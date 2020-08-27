import { Organisation } from 'xero-node';

export type IOrganisation = Required<Pick<Organisation, 'name' | 'edition' | 'isDemoCompany' | 'baseCurrency' | 'shortCode'>>;
