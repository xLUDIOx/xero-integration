export interface IService {
    getByDate(fromCurrency: string, toCurrency: string, date: Date): Promise<number | undefined>;
}
