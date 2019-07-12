import { Pool } from 'pg';

import { IStore } from './IStore';
import { PgStore } from './PgStore';

export * from './IStore';

export const initialize = async () => {
    const pgStore = createStore() as PgStore;
    await pgStore.initSchema();
};

export const createStore = (): IStore => {
    const pool = new Pool();
    pool.on('connect', async client => {
        await client.query(`SET "search_path" TO "xero_integration"`);
    });

    return new PgStore(pool);
};
