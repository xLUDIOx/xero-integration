import * as fs from 'fs';

import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';

import { config } from '../../Config';

const xeroConfigPath = getXeroConfigPath();

const baseConfig: XeroClientConfiguration & IXeroClientConfigurationV2 = {
    // tslint:disable-next-line: no-var-requires
    ...(fs.existsSync(xeroConfigPath) ? require(xeroConfigPath) : {}),
};

baseConfig.privateKeyPath = getXeroPrivateKeyPath(baseConfig);

export const AppType = baseConfig.appType;
export const getXeroConfig = (accountId: string, returnUrl?: string) => {
    const queryString = `accountId=${encodeURIComponent(accountId)}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
    return {
        ...baseConfig,
        callbackUrl: `${config.serviceUrl}/callback?${queryString}`,
    };
};

export const getXeroConfigV2 = (accountId: string, returnUrl?: string) => {
    const queryString = `accountId=${encodeURIComponent(accountId)}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
    return {
        clientId: baseConfig.clientId,
        clientSecret: baseConfig.clientSecret,
        scopes: baseConfig.scopes,
        redirectUris: [`${config.serviceUrl}/callback?${queryString}`],
    };
};

function getXeroConfigPath(): string {
    let result = process.env.XERO_CONFIG_PATH ? `${process.env.XERO_CONFIG_PATH}/xero-config.json` : '../../../xero-config.json';
    if (process.env.TELEPRESENCE_MOUNT_PATH) {
        result = process.env.TELEPRESENCE_MOUNT_PATH + result;
    }

    return result;
}

function getXeroPrivateKeyPath(conf: XeroClientConfiguration): string | undefined {
    let result = conf.privateKeyPath;
    if (!result) {
        return undefined;
    }

    if (process.env.TELEPRESENCE_MOUNT_PATH) {
        result = process.env.TELEPRESENCE_MOUNT_PATH + result;
    }

    return result;
}

interface IXeroClientConfigurationV2 {
    clientId: string;
    clientSecret: string;
    scopes: string[];
}
