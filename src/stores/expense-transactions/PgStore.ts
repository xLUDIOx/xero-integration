import { IDbClient, SCHEMA } from '@shared';

import { ExpenseTransactionRecordKeys, IExpenseTransactionRecord } from './IExpenseTransactionRecord';
import { IStore } from './IStore';

export class PgStore implements IStore {
    private readonly tableName: string = SCHEMA.TABLE_NAMES.EXPENSE_TRANSACTIONS;

    constructor(private readonly dbClient: IDbClient) {
    }

    async create(accountId: string, expenseId: string, transactionId: string): Promise<void> {
        await this.dbClient.query({
            text: `
                    INSERT INTO "${this.tableName}"
                        ("${ExpenseTransactionRecordKeys.account_id}", "${ExpenseTransactionRecordKeys.expense_id}", "${ExpenseTransactionRecordKeys.transaction_id}")
                    VALUES ($1, $2, $3)
                    ON CONFLICT ("${ExpenseTransactionRecordKeys.account_id}", "${ExpenseTransactionRecordKeys.expense_id}", "${ExpenseTransactionRecordKeys.transaction_id}")
                    DO NOTHING
                `,
            values: [
                accountId,
                expenseId,
                transactionId,
            ],
        });
    }

    async getByAccountId(accountId: string, expenseId: string): Promise<IExpenseTransactionRecord[]> {
        const result = await this.dbClient.query<IExpenseTransactionRecord>({
            text: `
                    SELECT * FROM "${this.tableName}"
                    WHERE "${ExpenseTransactionRecordKeys.account_id}"=$1 AND "${ExpenseTransactionRecordKeys.expense_id}"=$2
                `,
            values: [
                accountId,
                expenseId,
            ],
        });

        return result.rows;
    }

    async delete(accountId: string, expenseId: string, transactionId: string): Promise<void> {
        await this.dbClient.query<IExpenseTransactionRecord>({
            text: `
                    DELETE FROM "${this.tableName}"
                    WHERE "${ExpenseTransactionRecordKeys.account_id}"=$1 AND "${ExpenseTransactionRecordKeys.expense_id}"=$2 AND "${ExpenseTransactionRecordKeys.transaction_id}"=$3
                `,
            values: [
                accountId,
                expenseId,
                transactionId,
            ],
        });
    }
}
