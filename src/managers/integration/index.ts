import * as fs from 'fs';

import { FxRates, Payhawk } from '@services';
import { ITokenSet } from '@shared';
import { createSchemaStore } from '@stores';
import { ILogger } from '@utils';

import { config } from '../../Config';
import * as XeroEntities from '../xero-entities';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };

export type IManagerFactory = (params: IManagerFactoryParams, logger: ILogger) => IManager;

export interface IManagerFactoryParams {
    accessToken: ITokenSet;
    tenantId: string;
    accountId: string;
    payhawkApiKey?: string;
}

export const createManager: IManagerFactory = ({ accessToken, tenantId, accountId, payhawkApiKey }, logger: ILogger): IManager => {
    const xeroEntitiesManager = XeroEntities.createManager(accountId, accessToken, tenantId, logger);
    const deleteFile = (filePath: string): Promise<void> => new Promise((resolve) => fs.unlink(filePath, () => resolve()));

    return new Manager(
        accountId,
        config.portalUrl,
        createSchemaStore(logger),
        xeroEntitiesManager,
        Payhawk.createPayhawkClient(accountId, payhawkApiKey || ''),
        FxRates.createService(),
        deleteFile,
        logger,
    );
};
