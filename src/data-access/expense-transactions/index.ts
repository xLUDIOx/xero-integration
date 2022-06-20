import { IDbClient } from '@shared';

import { IStore } from './IStore';
import { PgStore } from './PgStore';

export * from './IStore';

export const create: (dbClient: IDbClient) => IStore =
    (dbClient: IDbClient) => new PgStore(dbClient);
