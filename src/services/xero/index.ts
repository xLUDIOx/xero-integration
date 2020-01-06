import { AccountingAPIClient as XeroClient } from 'xero-node';
import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Throttler } from '../../utils';
import { Auth } from './Auth';
import { Client } from './Client';
import { getXeroConfig } from './Config';
import { IAuth } from './IAuth';
import { IAccountingItemData, IClient, ICreateBillData, ICreateTransactionData, IUpdateBillData, IUpdateTransactionData } from './IClient';

export { IClient, IAccountingItemData, ICreateBillData, IUpdateBillData, ICreateTransactionData, IUpdateTransactionData, IAuth };
export { IAccountCode } from './IAccountCode';
export { IBankAccount } from './IBankAccount';
export { IAttachment } from './IAttachment';

export { AppType } from './Config';

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
