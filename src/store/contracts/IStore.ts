import { IExpenseTransactionRecord } from './IExpenseTransactionRecord';
import { INewUserTokenSetRecord, ITokenSet, IUserTokenSetRecord } from './IUserTokenSet';

export interface IStore {
    createAccessToken(record: INewUserTokenSetRecord): Promise<void>;
    updateAccessToken(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void>;
    getAccessToken(accountId: string): Promise<IUserTokenSetRecord | undefined>;
    deleteAccessToken(accountId: string): Promise<void>;

    getApiKey(accountId: string): Promise<string|undefined>;
    setApiKey(accountId: string, key: string): Promise<void>;

    createExpenseTransactionRecord(accountId: string, expenseId: string, transactionId: string): Promise<void>;
    getExpenseTransactions(accountId: string, expenseId: string): Promise<IExpenseTransactionRecord[]>;
    deleteExpenseTransaction(accountId: string, expenseId: string, transactionId: string): Promise<void>;
}
