import { AccountingAPIClient as XeroClient } from 'xero-node';
import { AccessToken, IOAuth1HttpClient, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { getXeroConfig } from './Config';
import { IAuth } from './IAuth';
import { IAuthRequest } from './IAuthRequest';

export class Auth implements IAuth {
    private readonly oauthClient: IOAuth1HttpClient;

    constructor(accountId: string, returnUrl?: string) {
        this.oauthClient = new XeroClient(getXeroConfig(accountId, returnUrl)).oauth1Client;
    }

    async getAuthUrl(): Promise<IAuthRequest> {
        const requestToken = await this.oauthClient.getRequestToken();
        return {
            requestToken,
            url: this.oauthClient.buildAuthoriseUrl(requestToken),
        };
    }

    async getAccessToken(requestToken: RequestToken, verifier: string): Promise<AccessToken> {
        return await this.oauthClient.swapRequestTokenforAccessToken(requestToken, verifier);
    }
}
