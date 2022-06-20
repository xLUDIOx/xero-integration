import { Pool } from 'pg';

import { SCHEMA } from '@shared';

const pool = new Pool();
pool.on('connect', async client => {
    await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
});

export interface IDbClient {
    query<T>(q: IQueryConfig): Promise<IQueryResult<T>>;
    transaction<T>(action: (dbClient: IDbClient) => Promise<T>): Promise<T>;
}

export type IQueryConfig = string | {
    text: string;
    values: any[];
}

export interface IQueryResult<T> {
    rows: T[];
    rowCount: number;
}

export function createDbClient(): IDbClient {
    return {
        query: async (q: IQueryConfig) => {
            return await pool.query(q);
        },

        transaction: async <T>(action: (dbClient: IDbClient) => Promise<T>) => {
            const client = await pool.connect();

            const nestedTransaction = async <NT>(act: (_: IDbClient) => Promise<NT>): Promise<NT> => {
                const nestedResult = await act({
                    query: async (q: IQueryConfig) => {
                        return await client.query(q);
                    },
                    transaction: nestedTransaction,
                });

                return nestedResult;
            };

            try {
                await client.query('BEGIN');

                const result = await action({
                    query: async (q: IQueryConfig) => {
                        return await client.query(q);
                    },
                    transaction: nestedTransaction,
                });

                await client.query('COMMIT');

                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },
    };
}
