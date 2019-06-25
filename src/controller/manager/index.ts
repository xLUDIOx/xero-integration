import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';

import { IManager } from './IManager';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (accountId: string) => IManager;
export const managerFactory: IManagerFactory = (accountId: string): IManager => {
    // tslint:disable-next-line: no-var-requires
    const baseConfig: XeroClientConfiguration = require('../../../config.json');
    return new Manager(baseConfig, accountId);
};
