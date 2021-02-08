import { AccountRecordKeys, IAccountRecord, IDbClient, SCHEMA } from '@shared';

import { IStore } from './IStore';

export class PgStore implements IStore {
    private readonly tableName: string = SCHEMA.TABLE_NAMES.ACCOUNTS;

    constructor(private readonly dbClient: IDbClient) {
    }

    async get(accountId: string): Promise<IAccountRecord | undefined> {
        const query = await this.dbClient.query<IAccountRecord>({
            text: `
                SELECT * FROM "${this.tableName}"
                WHERE "${AccountRecordKeys.account_id}" = $1
            `,
            values: [accountId],
        });

        return query.rows[0];
    }

    async update(accountId: string, isSynced: boolean): Promise<void> {
        await this.dbClient.query<{ payhawk_api_key: string }>({
            text: `
                UPDATE "${this.tableName}"
                SET "${AccountRecordKeys.initial_sync_completed}"=$2
                WHERE "${AccountRecordKeys.account_id}"=$1
            `,
            values: [accountId, isSynced],
        });
    }

    async create({ account_id, tenant_id, initial_sync_completed }: IAccountRecord): Promise<void> {
        await this.dbClient.query<{ payhawk_api_key: string }>({
            text: `
                INSERT INTO "${this.tableName}" ("${AccountRecordKeys.account_id}", "${AccountRecordKeys.tenant_id}", "${AccountRecordKeys.initial_sync_completed}")
                VALUES ($1, $2, $3)
                ON CONFLICT ("${AccountRecordKeys.account_id}")
                DO NOTHING
            `,
            values: [
                account_id,
                tenant_id,
                initial_sync_completed,
            ],
        });
    }
}
