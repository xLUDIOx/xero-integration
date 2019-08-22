import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Auth } from './Auth';
import { Client } from './Client';
import { IAuth } from './IAuth';
import { IClient } from './IClient';

export { IClient, IAuth };
export { IAccountCode } from './IAccountCode';
export { IBankAccount } from './IBankAccount';
export { IAttachment } from './IAttachment';

export const createAuth = (accountId: string): IAuth => {
    return new Auth(accountId);
};

export const createClient = (accountId: string, accessToken: AccessToken): IClient => {
    return new Client(accountId, accessToken);
};
