import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Xero } from '../../services';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export * from './IAccountCode';
export * from './INewAccountTransaction';
export * from './INewBill';
export const createManager = (accountId: string, xeroAccessToken: AccessToken): IManager => {
    const xeroClient = Xero.createClient(accountId, xeroAccessToken);
    return new Manager(xeroClient);
};
