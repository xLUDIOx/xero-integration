import { IAccountCode } from '../xero/IAccountCode';

export interface IClient {
    synchronizeChartOfAccounts(accountCodes: IAccountCode[]): Promise<void>;
}
