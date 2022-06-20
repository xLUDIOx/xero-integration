import { ILogger } from '@utils';

import { IStore as IAccessTokensStore } from './access-tokens';
import { IStore as IAccountsStore } from './accounts';
import { IStore as IApiKeysStore } from './api-keys';
import { IStore as IBankFeedsStore } from './bank-feeds';
import { IStore as IExpenseTransactionsStore } from './expense-transactions';

export interface ISchemaUnitOfWork {
    accessTokens: IAccessTokensStore;
    accounts: IAccountsStore;
    apiKeys: IApiKeysStore;
    bankFeeds: IBankFeedsStore;
    expenseTransactions: IExpenseTransactionsStore;

    initSchema(): Promise<void>;
    ensureSchemaVersion(): Promise<void>;

    transaction<T>(action: (store: ISchemaUnitOfWork) => Promise<T>, logger?: ILogger): Promise<T>
}
