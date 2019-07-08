import { IAccountCode } from './IAccountCode';

export interface IClient {
//    getExpense()
    synchronizeChartOfAccounts(accountCodes: IAccountCode[]): Promise<void>;
}
