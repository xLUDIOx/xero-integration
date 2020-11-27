import { Pool } from 'pg';

export * from './CommonTypes';
export * from './db-contracts';
export * from './client-contracts';
export * from './request-contracts';

// tslint:disable-next-line: no-namespace
export namespace SCHEMA {
    export const NAME = 'xero_integration';

    export enum TABLE_NAMES {
        ACCESS_TOKENS = 'oauth2_access_tokens',
        BANK_FEED_CONNECTIONS = 'bank_feed_connections',
        BANK_FEED_STATEMENTS = 'bank_feed_statements',
        EXPENSE_TRANSACTIONS = 'expense_transactions',
        PAYHAWK_API_KEYS = 'payhawk_api_keys',
    }
}

export type IDbClient = Pick<Pool, 'query'>;
