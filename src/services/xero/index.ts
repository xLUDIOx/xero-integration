import { AccountingAPIClient as XeroClient } from 'xero-node';
import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Throttler } from '../../utils';
import { Auth, IAuth } from './auth';
import { Client, IAccountingItemData, IBillPaymentData, IClient, ICreateBillData, ICreateTransactionData, IUpdateBillData, IUpdateTransactionData } from './client';
import { getXeroConfig } from './Config';

export { IClient, IAccountingItemData, ICreateBillData, IUpdateBillData, ICreateTransactionData, IUpdateTransactionData, IAuth, IBillPaymentData };

export { AppType } from './Config';

export * from './client';

const XERO_MAX_REQUESTS_COUNT = 40;
const THROTTLER_PERIOD_IN_SECONDS = 60;

const throttler = new Throttler(XERO_MAX_REQUESTS_COUNT, THROTTLER_PERIOD_IN_SECONDS);

export const createAuth = (accountId: string, returnUrl?: string): IAuth => {
    return new Auth(accountId, returnUrl);
};

export const createClient = (accountId: string, accessToken: AccessToken): IClient => {
    const originalClient = new XeroClient(getXeroConfig(accountId), accessToken);
    const wrappedClient = throttler.getThrottledWrap(accountId, originalClient);

    return new Client(wrappedClient);
};
