import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Payhawk, Xero } from '../../services';
import * as XeroContacts from '../xero-contacts';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (xerAccessToken: AccessToken, accountId: string, payhawkApiKey: string) => IManager;
export const createManager: IManagerFactory = (xerAccessToken: AccessToken, accountId: string, payhawkApiKey: string): IManager => {
    const xeroClient = Xero.createClient(accountId, xerAccessToken);
    const xeroContactsManager = XeroContacts.createManager(xeroClient);
    return new Manager(xeroClient,
            Payhawk.createPayhawkClient(accountId, payhawkApiKey),
            xeroContactsManager);
};
