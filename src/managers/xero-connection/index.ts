import { Xero } from '../../services';
import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (accountId: string) => IManager;
export const createManager: IManagerFactory = (accountId: string): IManager => {
    return new Manager(Xero.createAuth(accountId), accountId);
};
