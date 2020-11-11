import * as fs from 'fs';

import { IDbClient } from '@shared';
import { ILogger } from '@utils';

import { create as createAccessTokensStore, IStore as IAccessTokensStore } from './access-tokens';
import { create as createApiKeysStore, IStore as IApiKeysStore } from './api-keys';
import { create as createBankFeedsStore, IStore as IBankFeedsStore } from './bank-feeds';
import { create as createExpenseTransactionsStore, IStore as IExpenseTransactionsStore } from './expense-transactions';
import { ISchemaStore } from './ISchemaStore';

export class PgSchemaStore implements ISchemaStore {
    accessTokens: IAccessTokensStore;
    apiKeys: IApiKeysStore;
    bankFeeds: IBankFeedsStore;
    expenseTransactions: IExpenseTransactionsStore;

    constructor(private readonly dbClient: IDbClient, private readonly logger: ILogger) {
        this.accessTokens = createAccessTokensStore(this.dbClient, this.logger);
        this.apiKeys = createApiKeysStore(this.dbClient);
        this.bankFeeds = createBankFeedsStore(this.dbClient);
        this.expenseTransactions = createExpenseTransactionsStore(this.dbClient);
    }

    async initSchema(): Promise<void> {
        await this.dbClient.query(await readSchemaInitScript());
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
            await this.dbClient.query(scriptText);

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
