import * as fs from 'fs';

import { toBase64 } from '@utils';

const xeroConfigPath = getXeroConfigPath();

export const config: IXeroClientConfig = {
    // tslint:disable-next-line: no-var-requires
    ...(fs.existsSync(xeroConfigPath) ? require(xeroConfigPath) : {}),
};

export const getXeroAccountConfig = (accountId: string, returnUrl?: string): IXeroClientConfig => {
    const queryString = `accountId=${encodeURIComponent(accountId)}${returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
    return {
        ...config,
        state: toBase64(queryString),
    };
};

function getXeroConfigPath(): string {
    let result = process.env.XERO_CONFIG_PATH ? `${process.env.XERO_CONFIG_PATH}/xero-config.json` : '../../../xero-config.json';
    if (process.env.TELEPRESENCE_MOUNT_PATH) {
        result = process.env.TELEPRESENCE_MOUNT_PATH + result;
    }

    return result;
}

export interface IXeroClientConfig {
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
    scopes: string[];
    state?: string;
}
