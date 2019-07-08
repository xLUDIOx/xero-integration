import { IAccountCode } from './IAccountCode';

export interface IClient {
    getExpenseAccounts(): Promise<IAccountCode[]>;
    createTransaction(): Promise<void>;
}
