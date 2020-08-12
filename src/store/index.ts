import { Pool } from 'pg';

import { createLogger, ILogger } from '../utils';
import { SCHEMA } from './Config';
import { IStore } from './contracts';
import { PgStore } from './PgStore';

export * from './contracts';

export const createStore = (logger?: ILogger): IStore => {
    const loggerObj = logger || createLogger();

    const pool = new Pool();
    pool.on('connect', async client => {
        await client.query(`SET "search_path" TO "${SCHEMA.NAME}"`);
    });

    return new PgStore(pool, loggerObj);
};

const pgStore = createStore() as PgStore;

export const initialize = async () => {
    await pgStore.initSchema();
};

export const ensureSchemaVersion = async () => {
    await pgStore.ensureSchemaVersion();
};
