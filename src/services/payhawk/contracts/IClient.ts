import { IAccountCode } from './IAccountCode';
import { IBalanceTransfer } from './IBalanceTransfer';
import { IBusinessAccount } from './IBankAccount';
import { IDownloadedFile } from './IDownloadedFile';
import { IExpense } from './IExpense';
import { ITaxRate } from './ITaxRate';

export interface IClient {
    getExpense(expenseId: string): Promise<IExpense>;
    updateExpense(expenseId: string, patch: Partial<IExpense>): Promise<void>;
    getTransfer(balanceId: string, transferId: string): Promise<IBalanceTransfer | undefined>;
    getTransfers(startDate: string, endDate: string): Promise<IBalanceTransfer[]>;
    synchronizeTaxRates(taxRates: ITaxRate[]): Promise<void>;
    synchronizeChartOfAccounts(accountCodes: IAccountCode[]): Promise<void>;
    synchronizeBankAccounts(accountCodes: IBusinessAccount[]): Promise<void>;
    downloadFiles(expense: IExpense): Promise<IDownloadedFile[]>;
}
