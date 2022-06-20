import { createLogger, ILogger } from '../utils';
import { dbClient } from './db-client';
import { ISchemaStore } from './ISchemaStore';
import { PgSchemaStore } from './PgSchemaStore';

export { ISchemaStore };

export * as AccessTokens from './access-tokens';
export * as Accounts from './accounts';
export * as ApiKeys from './api-keys';
export * as BankFeeds from './bank-feeds';
export * as ExpenseTransactions from './expense-transactions';

export const createSchemaStore = (logger?: ILogger): ISchemaStore => {
    const loggerObj = logger || createLogger();

    return new PgSchemaStore(dbClient, loggerObj);
};

const schemaStore = createSchemaStore() as PgSchemaStore;

export const initialize = async () => {
    await schemaStore.initSchema();
};

export const ensureVersion = async () => {
    await schemaStore.ensureSchemaVersion();
};
