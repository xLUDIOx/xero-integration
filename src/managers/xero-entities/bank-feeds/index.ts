import { Xero } from '@services';

import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };

export const create: (xeroClient: Xero.IClient) => IManager =
    (client: Xero.IClient) => new Manager(client);
