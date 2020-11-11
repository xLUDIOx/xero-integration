import { Pool } from 'pg';

import { SCHEMA } from '@shared';

const pool = new Pool();
pool.on('connect', async client => {
    await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
});

export { pool as dbClient };
