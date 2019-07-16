import { IExpense } from './Expense';
import { IAccountCode } from './IAccountCode';
import { IDownloadedFile } from './IDownloadedFile';

export interface IClient {
    getExpense(expenseId: string): Promise<IExpense>;
    synchronizeChartOfAccounts(accountCodes: IAccountCode[]): Promise<void>;
    downloadFiles(expense: IExpense): Promise<IDownloadedFile[]>;
}
