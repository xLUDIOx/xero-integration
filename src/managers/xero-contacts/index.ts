import { Xero } from '../../services';
import { IManager } from './IManager';
import { Manager } from './Manager';

const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

export { IManager };
export const createManager = (xeroClient: Xero.IClient): IManager => new Manager(xeroClient, DEFAULT_SUPPLIER_NAME);
