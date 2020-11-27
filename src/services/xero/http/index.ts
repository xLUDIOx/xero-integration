import { XeroClient } from 'xero-node';

import { ILock, ILogger } from '@utils';

import { HttpClient } from './HttpClient';
import { IHttpClient } from './IHttpClient';
import { IXeroHttpClient } from './IXeroHttpClient';
import { XeroHttpClient } from './XeroHttpClient';

export * from './IHttpClient';
export * from './IXeroHttpClient';

export const createXeroHttpClient: (inner: XeroClient, lock: ILock, logger: ILogger) => IXeroHttpClient =
    (inner, lock, logger) => new XeroHttpClient(inner, lock, logger);

export const createHttpClient = (accessToken: string | undefined, tenantId: string | undefined, lock: ILock, logger: ILogger): IHttpClient =>
    new HttpClient(accessToken, tenantId, lock, logger);
