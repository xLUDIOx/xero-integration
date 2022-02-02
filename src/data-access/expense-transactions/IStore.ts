import { IExpenseTransactionRecord } from '@shared';

export interface IStore {
    createIfNotExists(accountId: string, expenseId: string, transactionId: string): Promise<void>;
    getByAccountId(accountId: string, expenseId: string): Promise<IExpenseTransactionRecord[]>;
    delete(accountId: string, expenseId: string, transactionId: string): Promise<void>;
}
