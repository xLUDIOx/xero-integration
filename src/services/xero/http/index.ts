import { XeroClient } from 'xero-node'
;

import { ILogger } from '../../../utils';
import { IXeroHttpClient } from './IXeroHttpClient';
import { XeroHttpClient } from './XeroHttpClient';

export * from './IXeroHttpClient';

export const createXeroHttpClient: (inner: XeroClient, logger: ILogger) => IXeroHttpClient =
    (inner, logger) => new XeroHttpClient(inner, logger);
