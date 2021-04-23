import { getEnv } from '@environment';
import { createLock, ILogger } from '@utils';

import { AuthClient } from '../client';
import { getXeroAccountConfig } from '../Config';
import { createHttpClient } from '../http';
import { Auth } from './Auth';
import { IAuth } from './IAuth';

export { Auth } from './Auth';
export { IAuth } from './IAuth';

export const createAuth = ({ accountId, returnUrl }: IAuthParams, logger: ILogger): IAuth => {
    const config = getXeroAccountConfig(accountId, returnUrl);
    const env = getEnv();
    const lock = createLock(accountId);
    return new Auth(AuthClient.create(createHttpClient(undefined, undefined, lock, logger), config, logger, env));
};

export interface IAuthParams {
    accountId: string;
    returnUrl?: string;
}
