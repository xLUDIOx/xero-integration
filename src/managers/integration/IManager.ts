
export interface IManager {
    exportExpense(expenseId: string): Promise<void>;
    exportTransfers(startDate: string, endDate: string): Promise<void>;
    synchronizeChartOfAccounts(): Promise<void>;
}
