import { ITaxRate } from '@shared';

import { IOrganisation } from '../contracts';

export interface IClient {
    getOrganisation(): Promise<IOrganisation>;
    getTaxRates(): Promise<ITaxRate[]>;
}
