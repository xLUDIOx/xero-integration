import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (accountId: string) => IManager;
export const managerFactory: IManagerFactory = (accountId: string): IManager => new Manager(accountId);
