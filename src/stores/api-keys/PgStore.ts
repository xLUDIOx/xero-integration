import { SCHEMA } from '../Config';
import { IDbClient } from '../db-client';
import { INewPayhawkApiKeyRecord, PayhawkApiKeyRecordKeys } from './IPayhawkApiKey';
import { IStore } from './IStore';

export class PgStore implements IStore {
    private readonly tableName: string = SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS;

    constructor(private readonly dbClient: IDbClient) {
    }

    async getByAccountId(accountId: string): Promise<string | undefined> {
        const query = await this.dbClient.query<{ key: string }>({
            text: `
                SELECT "${PayhawkApiKeyRecordKeys.key}" FROM "${this.tableName}"
                WHERE "${PayhawkApiKeyRecordKeys.account_id}" = $1
            `,
            values: [accountId],
        });

        if (query.rows.length > 0) {
            return query.rows[0].key;
        } else {
            return undefined;
        }
    }

    async set({ account_id, key }: INewPayhawkApiKeyRecord): Promise<void> {
        await this.dbClient.query<{ payhawk_api_key: string }>({
            text: `
                INSERT INTO "${this.tableName}" ("${PayhawkApiKeyRecordKeys.account_id}", "${PayhawkApiKeyRecordKeys.key}")
                VALUES ($1, $2)
                ON CONFLICT ("${PayhawkApiKeyRecordKeys.account_id}")
                DO
                    UPDATE SET "${PayhawkApiKeyRecordKeys.key}" = $2, "${PayhawkApiKeyRecordKeys.updated_at}" = NOW()
            `,
            values: [account_id, key],
        });
    }
}
