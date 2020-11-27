import { XeroClient } from 'xero-node';

import { getEnv } from '@environment';
import { ITokenSet } from '@shared';
import { createDocumentSanitizer, createLock, ILogger } from '@utils';

import { getXeroConfig } from '../Config';
import { createHttpClient, createXeroHttpClient } from '../http';
import { create as createAccountingClient } from './accounting';
import { create as createAuthClient } from './auth';
import { Client } from './Client';
import { IClient } from './contracts';

export * from './contracts';

export * as AuthClient from './auth';
export * as AccountingClient from './accounting';

const entitiesLock = createLock();

export const createClient = (accountId: string, accessToken: ITokenSet, tenantId: string, logger: ILogger): IClient => {
    const config = getXeroConfig(accountId);
    const env = getEnv();

    const originalClient = new XeroClient(config);
    originalClient.setTokenSet(accessToken);
    const xeroHttpClient = createXeroHttpClient(originalClient, entitiesLock, logger);

    const httpClient = createHttpClient(accessToken.access_token, tenantId, entitiesLock, logger);

    const authClient = createAuthClient(httpClient, config, logger, env);
    const accountingClient = createAccountingClient(httpClient, logger, env);

    return new Client(authClient, accountingClient, xeroHttpClient, tenantId, createDocumentSanitizer(), logger);
};
