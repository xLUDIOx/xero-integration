import { IEnvironment } from '@environment';
import { ITaxRate, TaxRateStatus } from '@shared';
import { ObjectSerializer } from '@utils';

import { EntityResponseType, IHttpClient } from '../../http';
import { buildUrl } from '../../shared';
import { IOrganisation } from '../contracts';
import { IClient } from './IClient';

export class Client implements IClient {
    constructor(
        private readonly httpClient: IHttpClient,
        private readonly env: IEnvironment,
    ) {
    }

    async getTaxRates(): Promise<ITaxRate[]> {
        const url = buildUrl(
            this.baseUrl(),
            '/TaxRates',
            {
                where: `CanApplyToExpenses==true&&Status=="${TaxRateStatus.Active}"`,
            }
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });

        const responseItems = response[EntityResponseType.TaxRates];
        const taxRates = ObjectSerializer.deserialize<ITaxRate[]>(responseItems);
        return taxRates;
    }

    async getOrganisation(): Promise<IOrganisation> {
        const url = buildUrl(
            this.baseUrl(),
            '/Organisations',
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });

        const responseItems = response[EntityResponseType.Organisations];
        const organisations = ObjectSerializer.deserialize<IOrganisation[]>(responseItems);

        // since request contains tenant ID
        // the response will include only a single org
        return organisations[0];
    }

    private baseUrl(): string {
        return `${this.env.xeroApiUrl}${API_PREFIX}`;
    }
}

const API_PREFIX = '/api.xro/2.0';
