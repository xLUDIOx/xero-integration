import { IOrganisation } from './IOrganisation';

export interface ITenant {
    id: string;
    tenantId: string;
    tenantName: string;
    tenantType: string;
    orgData?: IOrganisation;
}
