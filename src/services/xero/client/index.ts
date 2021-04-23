import { XeroClient } from 'xero-node';

import { getEnv } from '@environment';
import { ITokenSet } from '@shared';
import { createDocumentSanitizer, createLock, ILogger } from '@utils';

import { getXeroAccountConfig } from '../Config';
import { createHttpClient, createXeroHttpClient } from '../http';
import { create as createAccountingClient } from './accounting';
import { create as createAuthClient } from './auth';
import { create as createBankFeedsClient } from './bank-feeds';
import { Client } from './Client';
import { IClient } from './contracts';

export * from './contracts';

export * as AuthClient from './auth';
export * as AccountingClient from './accounting';
export * as BankFeedsClient from './bank-feeds';

export const createClient = (accountId: string, accessToken: ITokenSet, tenantId: string, logger: ILogger): IClient => {
    const config = getXeroAccountConfig(accountId);
    const lock = createLock(accountId);
    const env = getEnv();

    const originalClient = new XeroClient(config);
    originalClient.setTokenSet(accessToken);
    const xeroHttpClient = createXeroHttpClient(originalClient, lock, logger);

    const httpClient = createHttpClient(accessToken.access_token, tenantId, lock, logger);

    const authClient = createAuthClient(httpClient, config, logger, env);
    const accountingClient = createAccountingClient(httpClient, logger, env);
    const bankFeedsClient = createBankFeedsClient(httpClient, logger, env);

    return new Client(
        authClient,
        accountingClient,
        bankFeedsClient,
        xeroHttpClient,
        tenantId,
        createDocumentSanitizer(),
        logger,
    );
};
