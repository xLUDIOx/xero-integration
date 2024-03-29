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
import { IClient, IClientOptions } from './contracts';

export { Client };

export * from './contracts';

export * as AuthClient from './auth';
export * as AccountingClient from './accounting';
export * as BankFeedsClient from './bank-feeds';

const ACCOUNTS_WITH_FEES_TRACKING_CATEGORIES = [
    'macpaw_labs_ltd_76b9c04d',
    'macpaw_labs_ltd_399ab063',
    'macpaw_way_ltd_9db7bfc4',
    'setapp_limited_f3475f1e',
];

export const createClientOptions = (accountId: string): IClientOptions => {
    return {
        setTrackingCategoriesOnFees: ACCOUNTS_WITH_FEES_TRACKING_CATEGORIES.includes(accountId),
    };
};

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
    const options = createClientOptions(accountId);

    return new Client(
        authClient,
        accountingClient,
        bankFeedsClient,
        xeroHttpClient,
        tenantId,
        createDocumentSanitizer(),
        logger,
        options,
    );
};
