import { Pool } from 'pg';

import { IDbClient, IPayhawkApiKeyRecord, ITokenSet, IUserTokenSetRecord, PayhawkApiKeyRecordKeys, SCHEMA, UserTokenSetRecordKeys } from '@shared';

const pool = new Pool();
pool.on('connect', async client => {
    await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
});

const dbClient: IDbClient = pool;

export { dbClient };

export const XeroDbClient = Object.freeze({
    query: dbClient.query,
    cleanupTable: async (tableName: SCHEMA.TABLE_NAMES) => {
        return dbClient.query({
            text: `DELETE FROM "${tableName}"`,
        });
    },
    getApiKeyForAccount: async (accountId: string): Promise<IPayhawkApiKeyRecord | undefined> => {
        const result = await dbClient.query({
            text: `
                SELECT * FROM "${SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS}"
                WHERE "${PayhawkApiKeyRecordKeys.account_id}"=$1
            `,
            values: [accountId],
        });

        return result.rows[0];
    },
    getAccessTokenForAccount: async (accountId: string): Promise<IUserTokenSetRecord> => {
        const result = await dbClient.query({
            text: `
                SELECT * FROM "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}"
                WHERE "${UserTokenSetRecordKeys.account_id}"=$1
            `,
            values: [accountId],
        });

        return result.rows[0];
    },
    setAccessTokenForAccount: async (accountId: string, userId: string, tenantId: string, tokenSet: ITokenSet): Promise<void> => {
        await dbClient.query({
            text: `
            INSERT INTO "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}" (
                "${UserTokenSetRecordKeys.account_id}",
                "${UserTokenSetRecordKeys.user_id}",
                "${UserTokenSetRecordKeys.tenant_id}",
                "${UserTokenSetRecordKeys.token_set}"
            )
            VALUES ($1, $2, $3, $4)
            `,
            values: [accountId, userId, tenantId, tokenSet],
        });
    },
});
