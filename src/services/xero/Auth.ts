import { AccountingAPIClient as XeroClient } from 'xero-node';
import { AccessToken, IOAuth1HttpClient, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { AppType, getXeroConfig } from './Config';
import { IAuth } from './IAuth';
import { IAuthRequest } from './IAuthRequest';

export class Auth implements IAuth {
    constructor(private readonly accountId: string, private readonly returnUrl?: string) {
    }

    async getAuthUrl(): Promise<IAuthRequest> {
        const oauthClient = this.getOAuthClient();
        const requestToken = await oauthClient.getRequestToken();
        return {
            requestToken,
            url: oauthClient.buildAuthoriseUrl(requestToken),
        };
    }

    async getAccessToken(requestToken: RequestToken, verifier: string): Promise<AccessToken> {
        const oauthClient = this.getOAuthClient();
        return await oauthClient.swapRequestTokenforAccessToken(requestToken, verifier);
    }

    async refreshAccessToken(currentToken?: AccessToken): Promise<AccessToken | undefined> {
        if (AppType === 'partner') {
            return undefined;
        }

        const oauthClient = this.getOAuthClient(currentToken);
        const newToken = await oauthClient.refreshAccessToken();
        return newToken;
    }

    private getOAuthClient(currentState?: AccessToken): IOAuth1HttpClient {
        const xerConfig = getXeroConfig(this.accountId, this.returnUrl);
        const xeroClient = new XeroClient(xerConfig, currentState);
        return xeroClient.oauth1Client;
    }
}
