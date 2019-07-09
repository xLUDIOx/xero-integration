import { IExpense } from './Expense';
import { IAccountCode } from './IAccountCode';

export interface IClient {
    getExpense(expenseId: string): Promise<IExpense>;
    synchronizeChartOfAccounts(accountCodes: IAccountCode[]): Promise<void>;
}
