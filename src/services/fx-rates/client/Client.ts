import * as request from 'request-promise';

import { formatDate } from '@utils';

import { IClient, IHistoricalDataResponse } from './IClient';

export class Client implements IClient {
    constructor(
        private readonly url: string,
        private readonly accessKey: string,
    ) {
    }

    async getByDate(fromCurrency: string, toCurrency: string, date: Date): Promise<number | undefined> {
        const dateString = formatDate(date);

        const result: IHistoricalDataResponse = await request(
            `${this.url}/historical?access_key=${encodeURIComponent(this.accessKey)}&source=${encodeURIComponent(fromCurrency)}&currencies=${encodeURIComponent(toCurrency)}&date=${encodeURIComponent(dateString)}`,
            {
                method: 'GET',
                json: true,
            },
        );

        const item = result.quotes ? result.quotes[`${fromCurrency}${toCurrency}`] : undefined;
        return item;
    }
}
