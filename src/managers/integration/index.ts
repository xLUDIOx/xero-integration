import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Payhawk, Xero } from '../../services';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (xerAccessToken: AccessToken, accountId: string, payhawkApiKey: string) => IManager;
export const createManager: IManagerFactory = (xerAccessToken: AccessToken, accountId: string, payhawkApiKey: string): IManager => {
    return new Manager(Xero.createClient(accountId, xerAccessToken), Payhawk.createPayhawkClient(accountId, payhawkApiKey));
};
