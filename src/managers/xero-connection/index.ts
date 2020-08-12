import { Xero } from '../../services';
import { createStore, IStore } from '../../store';
import { ILogger } from '../../utils';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IStore, IManager };

export type IManagerFactory = (params: Xero.IAuthParams, logger: ILogger) => IManager;

export const createManager: IManagerFactory = ({ accountId, returnUrl }: Xero.IAuthParams, logger: ILogger): IManager => {
    return new Manager(
        createStore(logger),
        Xero.createAuth({ accountId, returnUrl }, logger),
        accountId,
        logger,
    );
};
