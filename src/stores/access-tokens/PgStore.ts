import { TokenSet } from 'openid-client';

import { IDbClient, SCHEMA } from '@shared';
import { ILogger } from '@utils';

import { IStore } from './IStore';
import { INewUserTokenSetRecord, ITokenSet, IUserTokenSetRecord, UserTokenSetRecordKeys } from './IUserTokenSet';

export class PgStore implements IStore {
    private readonly tableName: string = SCHEMA.TABLE_NAMES.ACCESS_TOKENS;

    constructor(private readonly dbClient: IDbClient, private logger: ILogger) {
    }

    async create({ account_id, user_id, tenant_id, token_set }: INewUserTokenSetRecord): Promise<void> {
        await this.ensureNoOtherActiveAccountIsConnectedToTenant(account_id, tenant_id);
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

    async update(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void> {
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
            this.logger.child({
                accountId,
                tenantId,
                tokenSet,
            }).error(Error('Failed to update token'));
        }
    }

    async updateTenant(accountId: string, tenantId: string): Promise<void> {
        const result = await this.dbClient.query({
            text: `
                UPDATE "${this.tableName}"
                SET
                    "${UserTokenSetRecordKeys.tenant_id}" = $2,
                    "${UserTokenSetRecordKeys.updated_at}" = now()
                WHERE "${UserTokenSetRecordKeys.account_id}"=$1
                RETURNING *
            `,
            values: [
                accountId,
                tenantId,
            ],
        });

        if (result.rows.length === 0) {
            this.logger.child({ accountId }).error(Error('Failed to update token'));
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

    private async ensureNoOtherActiveAccountIsConnectedToTenant(accountId: string, tenantId: string): Promise<void> {
        const otherNonDemoAccountsWithSameTenant = await this.dbClient.query<{ count: number }>({
            text: `
                SELECT COUNT(*) FROM "${this.tableName}"
                WHERE
                    "${UserTokenSetRecordKeys.account_id}"!=$1 AND
                    "${UserTokenSetRecordKeys.account_id}" NOT LIKE '%_demo' AND
                    "${UserTokenSetRecordKeys.tenant_id}"=$2
            `,
            values: [
                accountId,
                tenantId,
            ],
        });

        const hasOtherNonDemoAccountsWithSameTenant = otherNonDemoAccountsWithSameTenant.rows[0].count > 0;
        if (hasOtherNonDemoAccountsWithSameTenant && !accountId.endsWith(DEMO_SUFFIX)) {
            this.logger.child({ tenantId })
                .error(Error('Another active account already uses the same tenant ID'));
            return;
        }
    }
}

const DEMO_SUFFIX = '_demo';
