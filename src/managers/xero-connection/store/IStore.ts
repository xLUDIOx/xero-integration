import { AccessToken, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

export interface IStore {
    saveAccessToken(accountId: string, accessToken: AccessToken): Promise<void>;
    getAccessTokenByAccountId(accountId: string): Promise<AccessToken|undefined>;

    saveRequestToken(accountId: string, requestToken: RequestToken): Promise<void>;
    getRequestTokenByAccountId(accountId: string): Promise<RequestToken|undefined>;
}
