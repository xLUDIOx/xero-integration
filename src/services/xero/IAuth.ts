import { AccessToken, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { IAuthRequest } from './IAuthRequest';

export interface IAuth {
    getAuthUrl(): Promise<IAuthRequest>;
    getAccessToken(requestToken: RequestToken, verifier: string): Promise<AccessToken>;
    refreshAccessToken(currentToken?: AccessToken): Promise<AccessToken | undefined>;
}
