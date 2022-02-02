import { Pool } from 'pg';

import { IDbClient, SCHEMA } from '@shared';

const pool = new Pool();
pool.on('connect', async client => {
    await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
});

const dbClient: IDbClient = pool;
export { dbClient };
