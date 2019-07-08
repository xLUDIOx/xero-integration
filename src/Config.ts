export interface IConfig {
    serviceUrl: string;
    payhawkUrl: string;
}

let serviceConfigPath = process.env.CONFIG_PATH ? `${process.env.CONFIG_PATH}/xero-adapter-config.json` : '../../config.json';
if (process.env.TELEPRESENCE_MOUNT_PATH) {
    serviceConfigPath = process.env.TELEPRESENCE_MOUNT_PATH + serviceConfigPath;
}

// tslint:disable-next-line: no-var-requires
export const config = require(serviceConfigPath);
