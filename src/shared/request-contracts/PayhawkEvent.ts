export enum PayhawkEvent {
    Initialize = 'initialize',

    ApiKeySet = 'api-key-set',

    BankAccountsSynchronize = 'bank-accounts-synchronize',
    ChartOfAccountSynchronize = 'chart-of-accounts-synchronize',
    TaxRatesSynchronize = 'tax-rates-synchronize',
    ExternalCustomFieldsSynchronize = 'external-custom-fields-synchronize',

    ExpenseExport = 'expense-export',
    ExpenseDelete = 'expense-delete',
    BankStatementExport = 'bank-statement-export',
    TransferExport = 'transfer-export',
    TransfersExport = 'transfers-export',

    Disconnect = 'disconnect',
}
