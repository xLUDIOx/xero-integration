import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';

import { IManager } from './IManager';
import { IServiceConfig } from './IServiceConfig';
import { Manager } from './Manager';

export { IManager };
export type IManagerFactory = (accountId: string) => IManager;
export const managerFactory: IManagerFactory = (accountId: string): IManager => {
    let xeroConfigPath = process.env.XERO_CONFIG_PATH ? `${process.env.XERO_CONFIG_PATH}/xero-config.json` : '../../../xero-config.json';
    let serviceConfigPath = process.env.CONFIG_PATH ? `${process.env.CONFIG_PATH}/xero-adapter-config.json` : '../../../config.json';
    if (process.env.TELEPRESENCE_MOUNT_PATH) {
        xeroConfigPath = process.env.TELEPRESENCE_MOUNT_PATH + xeroConfigPath;
        serviceConfigPath = process.env.TELEPRESENCE_MOUNT_PATH + serviceConfigPath;
    }

    // tslint:disable-next-line: no-var-requires
    const baseXeroConfig: XeroClientConfiguration = require(xeroConfigPath);
    const serviceConfig: IServiceConfig = require(serviceConfigPath);
    return new Manager(baseXeroConfig, serviceConfig, accountId);
};
