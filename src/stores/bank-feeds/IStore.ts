import { IBankFeedConnectionRecord } from './IBankFeedConnection';
import { IBankFeedStatementRecord } from './IBankFeedStatement';

export interface IStore {
    getConnectionIdByCurrency(accountId: string, currency: string): Promise<string | undefined>;
    createConnection(newRecord: IBankFeedConnectionRecord): Promise<string>;

    getStatementIdByEntityId(filter: Omit<IBankFeedStatementRecord, 'bank_statement_id'>): Promise<string | undefined>;
    createStatement(newRecord: IBankFeedStatementRecord): Promise<void>;
}
