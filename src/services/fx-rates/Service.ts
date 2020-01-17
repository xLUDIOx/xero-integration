import * as FxRatesClient from './client';
import { IService } from './IService';

export class Service implements IService {
    constructor(private client: FxRatesClient.IClient) { }

    getByDate(fromCurrency: string, toCurrency: string, date: Date): Promise<number | undefined> {
        return this.client.getByDate(
            fromCurrency.toUpperCase(),
            toCurrency.toUpperCase(),
            date,
        );
    }
}
