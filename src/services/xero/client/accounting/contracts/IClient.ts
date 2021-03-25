import { AccountStatus, IAccountCode, INewAccountCode, IOrganisation, ITaxRate, ITrackingCategory } from '@shared';

export interface IClient {
    getOrganisation(): Promise<IOrganisation>;

    getExpenseAccounts(filter?: IExpenseAccountsFilter): Promise<IAccountCode[]>;
    createExpenseAccount(account: INewAccountCode): Promise<IAccountCode>;
    getTaxRates(): Promise<ITaxRate[]>;
    getTrackingCategories(): Promise<ITrackingCategory[]>

    deletePayment(paymentId: string): Promise<void>;
}

export interface IExpenseAccountsFilter {
    status?: AccountStatus;
}
