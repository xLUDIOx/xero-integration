import { XeroClient } from 'xero-node'
;

import { ILock, ILogger } from '@utils';

import { IXeroHttpClient } from './IXeroHttpClient';
import { XeroHttpClient } from './XeroHttpClient';

export * from './IXeroHttpClient';

export const createXeroHttpClient: (inner: XeroClient, lock: ILock, logger: ILogger) => IXeroHttpClient =
    (inner, lock, logger) => new XeroHttpClient(inner, lock, logger);
