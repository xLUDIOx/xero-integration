import { Xero } from '@services';
import { ILogger } from '@utils';

import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };

export const create: (xeroClient: Xero.IClient, logger: ILogger) => IManager =
    (client: Xero.IClient, logger: ILogger) => new Manager(client, logger);
