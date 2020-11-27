import { IEnvironment } from '@environment';

import { IHttpClient } from '../../http';
import { Client } from './Client';
import { IClient } from './IClient';

export * from './IClient';

export const create = (httpClient: IHttpClient, env: IEnvironment): IClient => {
    return new Client(httpClient, env);
};
