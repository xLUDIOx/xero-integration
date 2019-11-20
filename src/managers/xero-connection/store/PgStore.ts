import * as fs from 'fs';
import { Pool } from 'pg';
import { AccessToken, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { IStore } from './IStore';

export class PgStore implements IStore {
    constructor(private readonly pgClient: Pool) { }

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
}

const readSchemaInitScript = async (): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
        fs.readFile(`${process.cwd()}/assets/init.schema.sql`, 'utf8', (err, data) => {
            err ? reject(err) : resolve(data);
        });
    });
};
