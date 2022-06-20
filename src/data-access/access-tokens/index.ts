import { decode } from 'jsonwebtoken';

import { ITokenSet } from '@shared';
import { ILogger } from '@utils';

import { IDbClient } from '../db-client';
import { IStore } from './IStore';
import { PgStore } from './PgStore';

export * from './IStore';

export const create: (dbClient: IDbClient, logger: ILogger) => IStore =
    (dbClient: IDbClient, logger: ILogger) => new PgStore(dbClient, logger);

export const parseToken = (tokenSet: ITokenSet): ITokenSetPayload | undefined => {
    if (!tokenSet.access_token) {
        return undefined;
    }

    const payload = decode(tokenSet.access_token);
    if (!payload) {
        return undefined;
    }

    return payload as ITokenSetPayload;
};

export interface ITokenSetPayload {
    xero_userid: string;
}
