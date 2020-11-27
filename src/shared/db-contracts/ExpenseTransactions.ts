import { KeyNameMap } from '@shared';

export interface IExpenseTransactionRecord {
    account_id: string;
    expense_id: string;
    transaction_id: string;
}

export const ExpenseTransactionRecordKeys: KeyNameMap<IExpenseTransactionRecord> = {
    account_id: 'account_id',
    expense_id: 'expense_id',
    transaction_id: 'transaction_id',
};
