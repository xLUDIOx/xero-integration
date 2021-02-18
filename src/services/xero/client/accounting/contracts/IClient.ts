import { AccountStatus, IAccountCode, INewAccountCode, IOrganisation, ITaxRate } from '@shared';

export interface IClient {
    getOrganisation(): Promise<IOrganisation>;

    getExpenseAccounts(filter?: IExpenseAccountsFilter): Promise<IAccountCode[]>;
    createExpenseAccount(account: INewAccountCode): Promise<IAccountCode>;
    getTaxRates(): Promise<ITaxRate[]>;
}

export interface IExpenseAccountsFilter {
    status?: AccountStatus;
}
