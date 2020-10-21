import { IStore as IAccessTokensStore } from './access-tokens';
import { IStore as IApiKeysStore } from './api-keys';
import { IStore as IBankFeedsStore } from './bank-feeds';
import { IStore as IExpenseTransactionsStore } from './expense-transactions';

export interface ISchemaStore {
    accessTokens: IAccessTokensStore;
    apiKeys: IApiKeysStore;
    bankFeeds: IBankFeedsStore;
    expenseTransactions: IExpenseTransactionsStore;
}
