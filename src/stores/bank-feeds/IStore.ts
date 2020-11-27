import { IBankFeedConnectionRecord, IBankFeedStatementRecord } from '@shared';

export interface IStore {
    getConnectionIdByCurrency(accountId: string, currency: string): Promise<string | undefined>;
    createConnection(newRecord: IBankFeedConnectionRecord): Promise<string>;

    getStatementIdByEntityId(filter: IGetStatementFilter): Promise<string | undefined>;
    createStatement(newRecord: IBankFeedStatementRecord): Promise<void>;
}

export type IGetStatementFilter = Omit<IBankFeedStatementRecord, 'bank_statement_id'>
