import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Payhawk } from '../../services';
import * as XeroEntities from '../xero-entities';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (xerAccessToken: AccessToken, accountId: string, payhawkApiKey: string) => IManager;
export const createManager: IManagerFactory = (xerAccessToken: AccessToken, accountId: string, payhawkApiKey: string): IManager => {
    const xeroContactsManager = XeroEntities.createManager(accountId, xerAccessToken);
    return new Manager(Payhawk.createPayhawkClient(accountId, payhawkApiKey),
            xeroContactsManager);
};
