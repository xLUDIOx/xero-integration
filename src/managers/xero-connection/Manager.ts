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

    async authenticate(verifier: string): Promise<boolean> {
        if (!verifier) {
            throw Error('Missing verifier argument');
        }

        const requestToken = await this.store.getRequestTokenByAccountId(this.accountId);
        if (!requestToken) {
            return false;
        }

        try {
            const accessToken = await this.authClient.getAccessToken(requestToken, verifier);
            await this.store.saveAccessToken(this.accountId, accessToken);
        } catch (e) {
            if (e && e.name === 'XeroError') {
                return false;
            } else {
                throw e;
            }
        }

        return true;
    }

    async getAccessToken(): Promise<AccessToken|undefined> {
        return this.store.getAccessTokenByAccountId(this.accountId);
    }
}
