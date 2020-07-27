import * as fs from 'fs';

import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { AccessToken, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Xero } from '../services';
import { AppType } from '../services/xero';
import { ILogger, isTokenExpired } from '../utils';
import { SCHEMA } from './Config';
import { IAccessTokenRecord, INewUserTokenSetRecord, UserTokenSetRecordKeys } from './contracts';
import { IStore } from './IStore';

export class PgStore implements IStore {
    private readonly auth: Xero.IAuth;
    private readonly tokenMigrator: Xero.IAccessTokenMigrator;

    constructor(private readonly pgClient: Pool, private readonly logger: ILogger) {
        this.auth = Xero.createAuth('');
        this.tokenMigrator = Xero.createMigrator();
    }

    async saveAccessToken(accountId: string, accessToken: AccessToken): Promise<void> {
        await this.pgClient.query({
            text: `
            INSERT INTO "access_tokens" ("account_id", "access_token")
            VALUES ($1, $2)
            ON CONFLICT ("account_id")
            DO
                UPDATE SET "access_token" = $2, "updated_at" = now();
            `,
            values: [accountId, accessToken],
        });
    }

    async getAccessTokenByAccountId(accountId: string): Promise<AccessToken | undefined> {
        const queryResult = await this.pgClient.query({
            text: `SELECT "access_token" FROM "access_tokens" WHERE "account_id" = $1`,
            values: [accountId],
        });

        return queryResult.rows.length > 0 ? queryResult.rows[0].access_token : undefined;
    }

    async saveRequestToken(accountId: string, requestToken: RequestToken): Promise<void> {
        await this.pgClient.query({
            text: `
            INSERT INTO "request_tokens" ("account_id", "request_token")
            VALUES ($1, $2)
            ON CONFLICT ("account_id")
            DO
                UPDATE SET "request_token" = $2, "updated_at" = now();
            `,
            values: [accountId, requestToken],
        });
    }

    async saveAccessTokenV2({ account_id, user_id, tenant_id, token_set }: INewUserTokenSetRecord): Promise<void> {
        await this.pgClient.query({
            text: `
                INSERT INTO "${SCHEMA.TABLE_NAMES.ACCESS_TOKENS_V2}" (
                    "${UserTokenSetRecordKeys.account_id}",
                    "${UserTokenSetRecordKeys.user_id}",
                    "${UserTokenSetRecordKeys.tenant_id}",
                    "${UserTokenSetRecordKeys.token_set}"
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("${UserTokenSetRecordKeys.account_id}", "${UserTokenSetRecordKeys.user_id}")
                DO
                    UPDATE SET
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

    async getRequestTokenByAccountId(accountId: string): Promise<RequestToken | undefined> {
        const queryResult = await this.pgClient.query({
            text: `SELECT "request_token" FROM "request_tokens" WHERE "account_id" = $1`,
            values: [accountId],
        });

        return queryResult.rows.length > 0 ? queryResult.rows[0].request_token : undefined;
    }

    async initSchema(): Promise<void> {
        await this.pgClient.query(await readSchemaInitScript());
    }

    async ensureSchemaVersion(): Promise<void> {
        await this.applyMigration();
    }

    private async applyMigration(): Promise<void> {
        await this.applyDatabaseMigration();
        await this.applyTokenMigration();
    }

    private async applyDatabaseMigration(): Promise<void> {
        this.logger.info('Database migration started');

        const fileName = `migration.sql`;

        try {
            if (!scriptExists(fileName)) {
                return;
            }

            const scriptText = await readScript(fileName);
            await this.pgClient.query(scriptText);

            this.logger.info('Database migration finished');
        } catch (err) {
            throw this.logger.error(Error(`Database migration script failed: ${err.toString()}`));
        }
    }

    private async applyTokenMigration(): Promise<void> {
        if (AppType !== 'partner') {
            this.logger.info('Skipping access token migration because app is not of type "partner"');
            return;
        }

        this.logger.info('Access token migration started');

        const records = await this.getTokenRecords();
        if (records.length === 0) {
            this.logger.info('No tokens to migrate');
            return;
        }

        for (const record of records) {
            try {
                this.logger.info(`Migrating access token for account '${record.account_id}'`);

                const accessToken = await this.getValidAccessToken(record.access_token);
                const oauth2TokenSet = await this.tokenMigrator.migrate(accessToken);
                const tokenPayload = decodeToken(oauth2TokenSet.access_token);
                if (!tokenPayload) {
                    this.logger.error(Error('Unable to decode migrated access token'));
                    continue;
                }

                await this.saveAccessTokenV2({
                    account_id: record.account_id,
                    // cspell: disable-next-line
                    user_id: tokenPayload.xero_userid,
                    tenant_id: oauth2TokenSet.xero_tenant_id,
                    token_set: oauth2TokenSet,
                });

                if (accessToken !== record.access_token) {
                    await this.saveAccessToken(record.account_id, accessToken);
                }
            } catch (err) {
                this.logger.error(Error(`Token migration failed for account ${record.account_id}: ${err.toString()}`));
            }
        }

        this.logger.info('Access token migration finished');
    }

    private async getTokenRecords(): Promise<IAccessTokenRecord[]> {
        const queryResult = await this.pgClient.query({
            text: `SELECT * FROM "access_tokens"`,
        });

        return queryResult.rows;
    }

    private async getValidAccessToken(accessToken: AccessToken): Promise<AccessToken> {
        const result: AccessToken = accessToken;

        const isExpired = isTokenExpired(accessToken);
        if (isExpired) {
            const refreshedToken = await this.auth.refreshAccessToken(accessToken);
            if (refreshedToken) {
                accessToken = refreshedToken;
            }
        }

        return result;
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

const decodeToken = (accessToken: string): { [key: string]: any } | undefined => {
    const result = jwt.decode(accessToken, { json: true });
    if (result === null) {
        return undefined;
    }

    return result;
};
