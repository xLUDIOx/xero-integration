import { expect } from 'chai';

import { AccountRecordKeys, BankFeedConnectionRecordKeys, BankFeedStatementRecordKeys, ExpenseTransactionRecordKeys, KeyNameMap, PayhawkApiKeyRecordKeys, SCHEMA, UserTokenSetRecordKeys } from '@shared';
import { dbClient } from '@utils';

const TABLE_RECORD_KEYS_MAP: Record<SCHEMA.TABLE_NAMES, KeyNameMap<any>> = {
    [SCHEMA.TABLE_NAMES.ACCESS_TOKENS]: UserTokenSetRecordKeys,
    [SCHEMA.TABLE_NAMES.ACCOUNTS]: AccountRecordKeys,
    [SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS]: PayhawkApiKeyRecordKeys,
    [SCHEMA.TABLE_NAMES.BANK_FEED_CONNECTIONS]: BankFeedConnectionRecordKeys,
    [SCHEMA.TABLE_NAMES.BANK_FEED_STATEMENTS]: BankFeedStatementRecordKeys,
    [SCHEMA.TABLE_NAMES.EXPENSE_TRANSACTIONS]: ExpenseTransactionRecordKeys,
};

describe('Database tests', () => {
    describe(`'${SCHEMA.NAME}' schema`, () => {
        it('exists', async () => {
            const result = await dbClient.query({
                text: `
                    SELECT EXISTS (
                        SELECT schema_name
                        FROM information_schema.schemata
                        WHERE schema_name = $1
                    )
                `,
                values: [SCHEMA.NAME],
            });

            expect(result.rows[0].exists).to.eq(true);
        });

        const tableNames = Object.values(SCHEMA.TABLE_NAMES);
        for (const tableName of tableNames) {
            describe(`"${tableName}" table`, () => {
                it('exists', async () => {
                    const result = await dbClient.query({
                        text: `
                        SELECT EXISTS (
                            SELECT table_name
                            FROM information_schema.tables
                            WHERE table_schema = $1 AND table_name = $2
                        )
                    `,
                        values: [SCHEMA.NAME, tableName],
                    });

                    expect(result.rows[0].exists).to.eq(true);
                });

                for (const columnName of Object.values(TABLE_RECORD_KEYS_MAP[tableName])) {
                    it(`"${columnName}" column exists`, async () => {
                        const result = await dbClient.query({
                            text: `
                            SELECT EXISTS (
                                SELECT column_name
                                FROM information_schema.columns
                                WHERE table_schema=$1 AND table_name=$2 AND column_name=$3
                            )
                        `,
                            values: [SCHEMA.NAME, tableName, columnName],
                        });

                        expect(result.rows[0].exists).to.eq(true);
                    });
                }
            });

        }
    });
});
