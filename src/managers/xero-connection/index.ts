import { Xero } from '../../services';
import { IManager } from './IManager';
import { Manager } from './Manager';
import { createStore } from './store';

export { IManager };
export type IManagerFactory = (accountId: string) => IManager;
export const createManager: IManagerFactory = (accountId: string): IManager => {
    return new Manager(createStore(), Xero.createAuth(accountId), accountId);
};
