import * as XeroEntities from '../xero-entities';

export interface IManager {
    getOrganisation(): Promise<XeroEntities.IOrganisation>;

    exportExpense(expenseId: string): Promise<void>;
    exportBankStatementForExpense(expenseId: string): Promise<void>;
    deleteExpense(expenseId: string): Promise<void>;

    exportTransfer(balanceId: string, transferId: string): Promise<void>;
    exportTransfers(startDate: string, endDate: string): Promise<void>;
    exportBankStatementForTransfer(balanceId: string, transferId: string): Promise<void>;

    initialSynchronization(): Promise<ISyncResult | undefined>;

    synchronizeChartOfAccounts(): Promise<number>;
    synchronizeBankAccounts(): Promise<string[]>;
    synchronizeTaxRates(): Promise<number>;

    disconnect(): Promise<void>;
}

export interface ISyncResult {
    bankAccounts?: string[];
    accountCodesCount?: number;
    taxRatesCount?: number;
    expenseAccounts?: string[];
    errors: {
        bankAccounts?: string;
        accountCodes?: string;
        taxRates?: string;
        expenseAccounts?: string;
    }
}
