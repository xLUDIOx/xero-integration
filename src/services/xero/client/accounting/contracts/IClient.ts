import { IAccountCode, INewAccountCode, IOrganisation, ITaxRate } from '@shared';

export interface IClient {
    getOrganisation(): Promise<IOrganisation>;

    getExpenseAccounts(): Promise<IAccountCode[]>;
    getOrCreateExpenseAccount(account: INewAccountCode): Promise<IAccountCode>;
    getTaxRates(): Promise<ITaxRate[]>;
}
