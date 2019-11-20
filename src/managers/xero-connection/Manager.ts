import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { Xero } from '../../services';
import { IManager } from './IManager';
import { IStore } from './store/IStore';

export class Manager implements IManager {
    constructor(
        private readonly store: IStore,
        private readonly authClient: Xero.IAuth,
        private readonly accountId: string) { }

    async getAuthorizationUrl(): Promise<string> {
        const { url, requestToken } = await this.authClient.getAuthUrl();
        await this.store.saveRequestToken(this.accountId, requestToken);

        return url;
    }

    async authenticate(verifier: string): Promise<AccessToken | undefined> {
        if (!verifier) {
            throw Error('Missing verifier argument');
        }

        const requestToken = await this.store.getRequestTokenByAccountId(this.accountId);
        if (!requestToken) {
            return undefined;
        }

        try {
            const accessToken = await this.authClient.getAccessToken(requestToken, verifier);
            await this.store.saveAccessToken(this.accountId, accessToken);

            return accessToken;
        } catch (e) {
            if (e && e.name === 'XeroError') {
                return undefined;
            } else {
                throw e;
            }
        }
    }

    async getAccessToken(): Promise<AccessToken | undefined> {
        let xeroAccessToken = await this.store.getAccessTokenByAccountId(this.accountId);
        if (xeroAccessToken === undefined) {
            return undefined;
        }

        const isTokenExpired = xeroAccessToken.oauth_expires_at !== undefined && new Date(xeroAccessToken.oauth_expires_at) < new Date();
        if (isTokenExpired) {
            xeroAccessToken = await this.refreshAccessToken();
        }

        return xeroAccessToken;
    }

    async refreshAccessToken(): Promise<AccessToken | undefined> {
        const currentToken = await this.store.getAccessTokenByAccountId(this.accountId);
        const refreshedAccessToken = await this.authClient.refreshAccessToken(currentToken);
        if (refreshedAccessToken) {
            await this.store.saveAccessToken(this.accountId, refreshedAccessToken);
        }

        return refreshedAccessToken;
    }
}
