import { Pool } from 'pg';

import { SCHEMA } from '../Config';

export type IDbClient = Pick<Pool, 'query'>;

const pool = new Pool();
pool.on('connect', async client => {
    await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
});

const dbClient: IDbClient = pool;
export { dbClient };
