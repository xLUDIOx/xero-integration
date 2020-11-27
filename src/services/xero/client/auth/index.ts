import { IXeroClientConfig } from 'xero-node';

import { IEnvironment } from '@environment';
import { ILogger } from '@utils';

import { IHttpClient } from '../../http';
import { Client } from './Client';
import { IClient } from './IClient';

export * from './IClient';

export const create = (httpClient: IHttpClient, config: IXeroClientConfig, logger: ILogger, env: IEnvironment): IClient => {
    return new Client(httpClient, config, logger, env);
};
