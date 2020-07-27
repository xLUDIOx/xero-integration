import { Pool } from 'pg';

import { createLogger } from '../utils';
import { SCHEMA } from './Config';
import { IStore } from './IStore';
import { PgStore } from './PgStore';

export * from './contracts';
export * from './IStore';

export const createStore = (): IStore => {
    const logger = createLogger();

    const pool = new Pool();
    pool.on('connect', async client => {
        await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
    });

    return new PgStore(pool, logger);
};

const pgStore = createStore() as PgStore;

export const initialize = async () => {
    await pgStore.initSchema();
    await pgStore.ensureSchemaVersion();
};
