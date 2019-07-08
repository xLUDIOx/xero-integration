import { AccessToken, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Xero } from '../../services';
import { IManager } from './IManager';

const savedRequestTokens: { [accountId: string]: RequestToken } = {};
const savedAccessTokens: { [accountId: string]: AccessToken } = {};

export class Manager implements IManager {
    constructor(
        private readonly authClient: Xero.IAuth,
        private readonly accountId: string) { }

    isAuthenticated(): boolean {
        return !!savedAccessTokens[this.accountId]
            && !!savedAccessTokens[this.accountId].oauth_expires_at
            && savedAccessTokens[this.accountId].oauth_expires_at! > new Date();
    }

    async getAuthorizationUrl(): Promise<string> {
        const { url, requestToken } = await this.authClient.getAuthUrl();
        savedRequestTokens[this.accountId] = requestToken;

        return url;
    }

    async authenticate(verifier: string): Promise<boolean> {
        if (!verifier) {
            throw Error('Missing verifier argument');
        }

        if (!savedRequestTokens[this.accountId]) {
            return false;
        }

        try {
            const accessToken = await this.authClient.getAccessToken(savedRequestTokens[this.accountId], verifier);
            savedAccessTokens[this.accountId] = accessToken;
        } catch (e) {
            if (e && e.name === 'XeroError') {
                return false;
            } else {
                throw e;
            }
        }

        return true;
    }

    getAccessToken(): AccessToken {
        return savedAccessTokens[this.accountId];
    }
}
