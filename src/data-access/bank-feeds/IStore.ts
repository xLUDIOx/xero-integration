import { IBankFeedConnectionRecord, IBankFeedStatementRecord, OmitStrict } from '@shared';

export interface IStore {
    getConnectionIdByCurrency(accountId: string, currency: string): Promise<string | undefined>;
    getConnectionIdsForAccount(accountId: string): Promise<string[]>;
    deleteConnectionForAccount(accountId: string, connectionId: string): Promise<void>;
    createConnection(newRecord: IBankFeedConnectionRecord): Promise<string>;

    getStatementByEntityId(filter: IStatementFilter): Promise<string | undefined>;
    deleteStatementByEntityId(filter: Required<IStatementFilter>): Promise<void>;
    createStatement(newRecord: IBankFeedStatementRecord): Promise<void>;
    existsStatement(filter: IStatementExistsFilter): Promise<boolean>;
}

export type IStatementFilter = Omit<IBankFeedStatementRecord, 'bank_statement_id'> & Partial<Pick<IBankFeedStatementRecord, 'bank_statement_id'>>;
export type IStatementExistsFilter = OmitStrict<IStatementFilter, 'xero_entity_id'>;
