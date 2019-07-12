import { AccessToken, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { IStore } from './IStore';

export class InMemoryStore implements IStore {
    readonly savedRequestTokens: { [accountId: string]: RequestToken } = {};
    readonly savedAccessTokens: { [accountId: string]: AccessToken } = {};

    async saveAccessToken(accountId: string, accessToken: AccessToken): Promise<void> {
        this.savedAccessTokens[accountId] = accessToken;
    }

    async getAccessTokenByAccountId(accountId: string): Promise<AccessToken|undefined> {
        return this.savedAccessTokens[accountId];
    }

    async saveRequestToken(accountId: string, requestToken: RequestToken): Promise<void> {
        this.savedRequestTokens[accountId] = requestToken;
    }

    async getRequestTokenByAccountId(accountId: string): Promise<RequestToken|undefined> {
        return this.savedRequestTokens[accountId];
    }
}
