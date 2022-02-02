import { createSchemaStore } from '@data-access';
import { Xero } from '@services';
import { ILogger } from '@utils';

import { IManager } from './IManager';
import { isAccessTokenExpired, Manager } from './Manager';

export { IManager, isAccessTokenExpired, Manager };

export type IManagerFactory = (params: Xero.IAuthParams, logger: ILogger) => IManager;

export const createManager: IManagerFactory = ({ accountId, returnUrl }: Xero.IAuthParams, logger: ILogger): IManager => {
    return new Manager(
        createSchemaStore(logger),
        Xero.createAuth({ accountId, returnUrl }, logger),
        accountId,
        logger,
    );
};
