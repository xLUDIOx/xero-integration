export interface IManager {
    getOrganisationName(): Promise<string>;

    exportExpense(expenseId: string): Promise<void>;
    exportBankStatementForExpense(expenseId: string): Promise<void>;
    deleteExpense(expenseId: string): Promise<void>;

    exportTransfer(balanceId: string, transferId: string): Promise<void>;
    exportTransfers(startDate: string, endDate: string): Promise<void>;
    exportBankStatementForTransfer(balanceId: string, transferId: string): Promise<void>;

    synchronizeChartOfAccounts(): Promise<void>;
    synchronizeBankAccounts(): Promise<void>;
    synchronizeTaxRates(): Promise<void>;
}
