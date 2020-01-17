import { getEnv } from '../../../environment';
import { Client } from './Client';
import { IClient } from './IClient';

export * from './IClient';

export const create: () => IClient = () => {
    const env = getEnv();
    return new Client(env.fxRatesApiUrl, env.fxRatesApiKey);
};
