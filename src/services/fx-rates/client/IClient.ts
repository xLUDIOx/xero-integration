export interface IClient {
    getByDate(fromCurrency: string, toCurrency: string, date: Date): Promise<number | undefined>;
}

export interface IHistoricalDataResponse {
    quotes: {
        [key: string]: number;
    };
}
