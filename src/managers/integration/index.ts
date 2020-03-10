import * as fs from 'fs';

import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { config } from '../../Config';
import { FxRates, Payhawk } from '../../services';
import * as XeroEntities from '../xero-entities';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (xeroAccessToken: AccessToken, accountId: string, payhawkApiKey: string) => IManager;
export const createManager: IManagerFactory = (xeroAccessToken: AccessToken, accountId: string, payhawkApiKey: string): IManager => {
    const xeroContactsManager = XeroEntities.createManager(accountId, xeroAccessToken);
    const deleteFile = (filePath: string): Promise<void> => new Promise((resolve) => fs.unlink(filePath, () => resolve()));
    return new Manager(Payhawk.createPayhawkClient(accountId, payhawkApiKey),
            xeroContactsManager,
            FxRates.createService(),
            deleteFile,
            accountId,
            config.portalUrl);
};
