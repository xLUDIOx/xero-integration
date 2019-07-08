import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';

import { config } from '../../Config';

let xeroConfigPath = process.env.XERO_CONFIG_PATH ? `${process.env.XERO_CONFIG_PATH}/xero-config.json` : '../../../xero-config.json';
if (process.env.TELEPRESENCE_MOUNT_PATH) {
    xeroConfigPath = process.env.TELEPRESENCE_MOUNT_PATH + xeroConfigPath;
}

// tslint:disable-next-line: no-var-requires
const baseConfig: XeroClientConfiguration = require(xeroConfigPath);
export const getXeroConfig = (accountId: string) => {
    return {
        ...baseConfig,
        callbackUrl: `${config.serviceUrl}/callback?accountId=${encodeURIComponent(accountId)}`,
    };
};
