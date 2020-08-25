import * as fs from 'fs';

import { TokenSet } from 'openid-client';
import { Pool } from 'pg';

import { ILogger } from '../utils';
import { SCHEMA } from './Config';
import { INewUserTokenSetRecord, IStore, IUserTokenSetRecord, UserTokenSetRecordKeys } from './contracts';

export class PgStore implements IStore {

    constructor(private readonly pgClient: Pool, private readonly logger: ILogger) {
    }

    async saveAccessToken({ account_id, user_id, tenant_id, token_set }: INewUserTokenSetRecord): Promise<void> {
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

    async initSchema(): Promise<void> {
        await this.pgClient.query(await readSchemaInitScript());
    }

    async ensureSchemaVersion(): Promise<void> {
        await this.applyMigration();
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
