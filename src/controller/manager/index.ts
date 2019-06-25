import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';

import { IManager } from './IManager';
import { IServiceConfig } from './IServiceConfig';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (accountId: string) => IManager;
export const managerFactory: IManagerFactory = (accountId: string): IManager => {
    const xeroConfigPath = process.env.CONFIG_PATH ? `${process.env.XERO_CONFIG_PATH}/xero-config.json` : '../../../xero-config.json';
    const serviceConfigPath = process.env.CONFIG_PATH ? `${process.env.CONFIG_PATH}/xero-adapter-config.json` : '../../../config.json';
    // tslint:disable-next-line: no-var-requires
    const baseXeroConfig: XeroClientConfiguration = require(xeroConfigPath);
    const serviceConfig: IServiceConfig = require(serviceConfigPath);
    return new Manager(baseXeroConfig, serviceConfig, accountId);
};
