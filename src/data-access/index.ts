import { ILogger } from '../utils';
import { createDbClient } from './db-client';
import { ISchemaUnitOfWork } from './ISchemaUnitOfWork';
import { PgSchemaUnitOfWork } from './PgSchemaUnitOfWork';

export { ISchemaUnitOfWork };

export * as AccessTokens from './access-tokens';
export * as Accounts from './accounts';
export * as ApiKeys from './api-keys';
export * as BankFeeds from './bank-feeds';
export * as ExpenseTransactions from './expense-transactions';

export const createSchemaStore = (logger: ILogger): ISchemaUnitOfWork => {
    const loggerObj = logger;

    return new PgSchemaUnitOfWork(createDbClient(), loggerObj);
};
