import { TokenSet } from 'openid-client';

import { INewUserTokenSetRecord, ITokenSet, IUserTokenSetRecord, SCHEMA, UserTokenSetRecordKeys } from '@shared';
import { ILogger, TenantConflictError } from '@utils';

import { IDbClient } from '../db-client';
import { IStore } from './IStore';
export class PgStore implements IStore {
    private readonly tableName: string = SCHEMA.TABLE_NAMES.ACCESS_TOKENS;

    constructor(private readonly dbClient: IDbClient, private logger: ILogger) {
    }

    async create({ account_id, user_id, tenant_id, token_set }: INewUserTokenSetRecord): Promise<void> {
        await this.preventAccountTenantConflict(account_id, tenant_id);

        await this.dbClient.query({
            text: `
                INSERT INTO "${this.tableName}" (
                    "${UserTokenSetRecordKeys.account_id}",
                    "${UserTokenSetRecordKeys.user_id}",
                    "${UserTokenSetRecordKeys.tenant_id}",
                    "${UserTokenSetRecordKeys.token_set}"
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("${UserTokenSetRecordKeys.account_id}")
                DO
                    UPDATE SET
                        "${UserTokenSetRecordKeys.user_id}" = $2,
                        "${UserTokenSetRecordKeys.tenant_id}" = $3,
                        "${UserTokenSetRecordKeys.token_set}" = $4,
                        "${UserTokenSetRecordKeys.updated_at}" = now();
            `,
            values: [
                account_id,
                user_id,
                tenant_id,
                token_set,
            ],
        });
    }

    async updateToken(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void> {
        const result = await this.dbClient.query({
            text: `
                UPDATE "${this.tableName}"
                SET
                    "${UserTokenSetRecordKeys.token_set}" = $3,
                    "${UserTokenSetRecordKeys.updated_at}" = now()
                WHERE "${UserTokenSetRecordKeys.account_id}"=$1 AND "${UserTokenSetRecordKeys.tenant_id}"=$2
                RETURNING *
            `,
            values: [
                accountId,
                tenantId,
                tokenSet,
            ],
        });

        if (result.rows.length === 0) {
            throw this.logger.child({
                accountId,
                tenantId,
                tokenSet,
            }).error(Error('Failed to update token'));
        }
    }

    async getByAccountId(accountId: string): Promise<IUserTokenSetRecord | undefined> {
        const query = await this.dbClient.query<IUserTokenSetRecord>({
            text: `
                SELECT * FROM "${this.tableName}"
                WHERE "${UserTokenSetRecordKeys.account_id}"=$1
            `,
            values: [
                accountId,
            ],
        });

        const record = query.rows[0];
        if (record) {
            record.token_set = new TokenSet(record.token_set);
        }

        return record;
    }

    async delete(tenantId: string): Promise<void> {
        await this.dbClient.query({
            text: `
                DELETE FROM "${this.tableName}"
                WHERE "${UserTokenSetRecordKeys.tenant_id}"=$1
            `,
            values: [
                tenantId,
            ],
        });
    }

    private async preventAccountTenantConflict(accountId: string, tenantId: string): Promise<void> {
        const queryResult = await this.dbClient.query<Pick<INewUserTokenSetRecord, 'account_id'>>({
            text: `
                SELECT "${UserTokenSetRecordKeys.account_id}" FROM "${this.tableName}"
                WHERE
                    "${UserTokenSetRecordKeys.account_id}"!=$1 AND
                    "${UserTokenSetRecordKeys.account_id}" NOT LIKE '%${DEMO_SUFFIX}' AND
                    "${UserTokenSetRecordKeys.tenant_id}"=$2
            `,
            values: [
                accountId,
                tenantId,
            ],
        });

        const hasConflictingAccount = queryResult.rows.length > 0;
        if (hasConflictingAccount && !accountId.endsWith(DEMO_SUFFIX)) {
            throw new TenantConflictError(tenantId, accountId, queryResult.rows[0].account_id);
        }
    }
}

const DEMO_SUFFIX = '_demo';
