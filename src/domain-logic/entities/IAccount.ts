export interface IAccount {
    id: string;
    payhawkAccountId: string;
    accountingSystemAccountId?: string;
    accountingSystemSubsidiaryId?: string;
    accountingSystemSubsidiaryCurrency?: string;
    accountingSystemAccountName?: string;
    accountingSystemAccessToken?: any;
    accountingSystemConfig?: IAccountConnectionConfig;
    payhawkApiKey?: string;
    initialized: boolean;
}

export type ICurrencyToBankAccountIdMap = Record<string, string>;

export type IAccountConnectionConfig = {
    reimbursableExpensesExportType?: ReimbursementExportType;

    reimbursableExpensesAccountId?: string;
    vendorExpensesAccountId?: string;

    expenseCategorizationType?: ExpenseCategorizationType;

    bankAccountsMapping?: ICurrencyToBankAccountIdMap;

    feesAccountId?: string;
    generalExpensesAccountId?: string;
};

export enum ReimbursementExportType {
    VendorBill = 'vendor-bill',
}

export enum ExpenseCategorizationType {
    GeneralLedgerAccountCodes = 'general-ledger-account-codes',
}
