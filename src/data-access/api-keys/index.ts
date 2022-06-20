import { IDbClient } from '../db-client';
import { IStore } from './IStore';
import { PgStore } from './PgStore';

export * from './IStore';

export const create: (dbClient: IDbClient) => IStore =
    (dbClient: IDbClient) => new PgStore(dbClient);
