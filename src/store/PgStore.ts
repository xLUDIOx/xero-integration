import * as fs from 'fs';

import { TokenSet } from 'openid-client';
import { Pool } from 'pg';

import { ILogger } from '../utils';
import { SCHEMA } from './Config';
import { INewUserTokenSetRecord, IStore, ITokenSet, IUserTokenSetRecord, PayhawkApiKeyRecordKeys, UserTokenSetRecordKeys } from './contracts';

const DEMO_SUFFIX = '_demo';

export class PgStore implements IStore {
    constructor(private readonly pgClient: Pool, private readonly logger: ILogger) {
    }

    async createAccessToken({ account_id, user_id, tenant_id, token_set }: INewUserTokenSetRecord): Promise<void> {
        await this.ensureNoOtherActiveAccountIsConnectedToTenant(account_id, tenant_id);
        await this.pgClient.query({
            text: `
                INSERT INTO "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}" (
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

    async updateAccessToken(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void> {
        const result = await this.pgClient.query({
            text: `
                UPDATE "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}"
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

    async getAccessToken(accountId: string): Promise<IUserTokenSetRecord | undefined> {
        const query = await this.pgClient.query<IUserTokenSetRecord>({
            text: `
                SELECT * FROM "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}"
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

    async deleteAccessToken(tenantId: string): Promise<void> {
        await this.pgClient.query({
            text: `
                DELETE FROM "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}"
                WHERE "${UserTokenSetRecordKeys.tenant_id}"=$1
            `,
            values: [
                tenantId,
            ],
        });
    }

    async getApiKey(accountId: string): Promise<string | undefined> {
        const query = await this.pgClient.query<{ key: string }>({
            text: `
                SELECT "${PayhawkApiKeyRecordKeys.key}" FROM "${SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS}"
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

    async setApiKey(accountId: string, key: string): Promise<void> {
        await this.pgClient.query<{ payhawk_api_key: string }>({
            text: `
                INSERT INTO "${SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS}" ("${PayhawkApiKeyRecordKeys.account_id}", "${PayhawkApiKeyRecordKeys.key}")
                VALUES ($1, $2)
                ON CONFLICT ("${PayhawkApiKeyRecordKeys.account_id}")
                DO
                    UPDATE SET "${PayhawkApiKeyRecordKeys.key}" = $2, "${PayhawkApiKeyRecordKeys.updated_at}" = NOW()
            `,
            values: [accountId, key],
        });
    }

    async initSchema(): Promise<void> {
        await this.pgClient.query(await readSchemaInitScript());
    }

    async ensureSchemaVersion(): Promise<void> {
        await this.applyMigration();
    }

    private async ensureNoOtherActiveAccountIsConnectedToTenant(accountId: string, tenantId: string): Promise<void> {
        const otherNonDemoAccountsWithSameTenant = await this.pgClient.query<{ count: number }>({
            text: `
                SELECT COUNT(*) FROM "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS}"
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

    private async applyMigration(): Promise<void> {
        await this.applyDatabaseMigration();
    }

    private async applyDatabaseMigration(): Promise<void> {
        const fileName = `migration.sql`;
        if (!scriptExists(fileName)) {
            this.logger.info('Database migration skipped. No script');
            return;
        }

        try {
            this.logger.info('Database migration started');

            const scriptText = await readScript(fileName);
            await this.pgClient.query(scriptText);

            this.logger.info('Database migration finished');
        } catch (err) {
            const error = Error(`Database migration script failed: ${err.toString()}`);

            this.logger.error(error);
        }
    }
}

const readSchemaInitScript = async (): Promise<string> => {
    return readScript('init.schema.sql');
};

const readScript = async (name: string): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
        fs.readFile(getPathFullName(name), 'utf8', (err, data) => {
            err ? reject(err) : resolve(data);
        });
    });
};

const scriptExists = (name: string): boolean => {
    return fs.existsSync(getPathFullName(name));
};

const getPathFullName = (fileName: string): string => {
    return `${process.cwd()}/assets/${fileName}`;
};
