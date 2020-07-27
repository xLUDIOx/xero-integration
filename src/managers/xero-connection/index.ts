import { Xero } from '../../services';
import { createStore, IStore } from '../../store';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager, IStore };
export type IManagerFactory = (accountId: string, returnUrl?: string) => IManager;

export const createManager: IManagerFactory = (accountId: string, returnUrl?: string): IManager => {
    return new Manager(createStore(), Xero.createAuth(accountId, returnUrl), accountId);
};
