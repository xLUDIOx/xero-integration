export enum PayhawkEvent {
    ApiKeySet = 'api-key-set',
    BankAccountsSynchronize = 'bank-accounts-synchronize',
    ChartOfAccountSynchronize = 'chart-of-accounts-synchronize',
    TaxRatesSynchronize = 'tax-rates-synchronize',
    Disconnect = 'disconnect',
    ExpenseDelete = 'expense-delete',
    ExpenseExport = 'expense-export',
    BankStatementExport = 'bank-statement-export',
    TransferExport = 'transfer-export',
    /**
     * @deprecated  With auto export enabled for all accounts, this event will no longer be used
     */
    TransfersExport = 'transfers-export',
}
