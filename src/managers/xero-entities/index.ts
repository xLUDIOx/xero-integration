import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Xero } from '../../services';
import { IManager } from './IManager';
import { Manager } from './Manager';

const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

export { IManager };
export * from './IAccountCode';
export * from './INewAccountTransaction';
export * from './INewBill';
export const createManager = (accountId: string, xerAccessToken: AccessToken): IManager => {
    const xeroClient = Xero.createClient(accountId, xerAccessToken);
    return new Manager(xeroClient, DEFAULT_SUPPLIER_NAME);
};
