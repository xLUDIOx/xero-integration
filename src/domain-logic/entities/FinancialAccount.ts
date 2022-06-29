export class FinancialAccount {
    constructor(
        readonly name: string,
        readonly code: string,
        readonly type: FinancialAccountType,
        readonly description?: string,
        readonly currency?: string,
    ) { }
}

export enum FinancialAccountType {
    AccountsPayable = 'accounts-payable',
    Bank = 'bank',
    Expense = 'expense',
    FixedAsset = 'fixed-asset'
}
