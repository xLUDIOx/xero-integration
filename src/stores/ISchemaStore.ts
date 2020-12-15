import { IStore as IAccessTokensStore } from './access-tokens';
import { IStore as IAccountsStore } from './accounts';
import { IStore as IApiKeysStore } from './api-keys';
import { IStore as IBankFeedsStore } from './bank-feeds';
import { IStore as IExpenseTransactionsStore } from './expense-transactions';

export interface ISchemaStore {
    accessTokens: IAccessTokensStore;
    accounts: IAccountsStore;
    apiKeys: IApiKeysStore;
    bankFeeds: IBankFeedsStore;
    expenseTransactions: IExpenseTransactionsStore;
}
