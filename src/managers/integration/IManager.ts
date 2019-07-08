
export interface IManager {
    exportExpense(expenseId: string): Promise<void>;
    synchronizeChartOfAccounts(): Promise<void>;
}
