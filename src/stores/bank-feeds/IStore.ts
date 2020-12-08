import { IBankFeedConnectionRecord, IBankFeedStatementRecord } from '@shared';

export interface IStore {
    getConnectionIdByCurrency(accountId: string, currency: string): Promise<string | undefined>;
    getConnectionIdsForAccount(accountId: string): Promise<string[]>;
    deleteConnectionForAccount(accountId: string, connectionId: string): Promise<void>;
    createConnection(newRecord: IBankFeedConnectionRecord): Promise<string>;

    getStatementByEntityId(filter: IStatementFilter): Promise<string | undefined>;
    deleteStatementByEntityId(filter: Required<IStatementFilter>): Promise<void>;
    createStatement(newRecord: IBankFeedStatementRecord): Promise<void>;
}

export type IStatementFilter = Omit<IBankFeedStatementRecord, 'bank_statement_id'> & Partial<Pick<IBankFeedStatementRecord, 'bank_statement_id'>>;
