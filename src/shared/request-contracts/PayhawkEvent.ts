export enum PayhawkEvent {
    Initialize = 'initialize',

    ApiKeySet = 'api-key-set',

    BankAccountsSynchronize = 'bank-accounts-synchronize',
    ChartOfAccountSynchronize = 'chart-of-accounts-synchronize',
    TaxRatesSynchronize = 'tax-rates-synchronize',

    ExpenseExport = 'expense-export',
    ExpenseDelete = 'expense-delete',
    BankStatementExport = 'bank-statement-export',
    TrackingCategories = 'tracking-categories',
    TransferExport = 'transfer-export',

    Disconnect = 'disconnect',

    /**
     * @deprecated  With auto export enabled for all accounts, this event will no longer be used
     */
    TransfersExport = 'transfers-export',

}
