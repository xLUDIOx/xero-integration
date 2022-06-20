import * as fs from 'fs';

import { ILogger } from '@utils';

import { create as createAccessTokensStore, IStore as IAccessTokensStore } from './access-tokens';
import { create as createAccountsStore, IStore as IAccountsStore } from './accounts';
import { create as createApiKeysStore, IStore as IApiKeysStore } from './api-keys';
import { create as createBankFeedsStore, IStore as IBankFeedsStore } from './bank-feeds';
import { IDbClient } from './db-client';
import { create as createExpenseTransactionsStore, IStore as IExpenseTransactionsStore } from './expense-transactions';
import { ISchemaUnitOfWork } from './ISchemaUnitOfWork';

export class PgSchemaUnitOfWork implements ISchemaUnitOfWork {
    accounts: IAccountsStore;
    accessTokens: IAccessTokensStore;
    apiKeys: IApiKeysStore;
    bankFeeds: IBankFeedsStore;
    expenseTransactions: IExpenseTransactionsStore;

    constructor(private readonly dbClient: IDbClient, private readonly logger: ILogger) {
        this.accounts = createAccountsStore(this.dbClient);
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

    async transaction<T>(action: (store: ISchemaUnitOfWork) => Promise<T>, logger?: ILogger): Promise<T> {
        return await this.dbClient.transaction<T>(async (client: IDbClient) => {
            const uow = new PgSchemaUnitOfWork(client, logger || this.logger);
            return await action(uow);
        });
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
        } catch (err: any) {
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
