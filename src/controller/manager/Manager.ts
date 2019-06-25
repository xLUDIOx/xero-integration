import { AccountingAPIClient as XeroClient } from 'xero-node';
import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';
import { AccessToken, IOAuth1HttpClient, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { IManager } from '.';
import { IAccount } from './IAccount';
import { IServiceConfig } from './IServiceConfig';

const savedRequestTokens: { [accountId: string]: RequestToken } = {};
const savedAccessTokens: { [accountId: string]: AccessToken } = {};

export class Manager implements IManager {
    constructor(
        private readonly xeroBaseConfig: XeroClientConfiguration,
        private readonly serviceConfig: IServiceConfig,
        private readonly accountId: string) { }

    isXeroAuthenticated(): boolean {
        return !!savedAccessTokens[this.accountId]
            && !!savedAccessTokens[this.accountId].oauth_expires_at
            && savedAccessTokens[this.accountId].oauth_expires_at! > new Date();
    }

    async getXeroAuthorizationUrl(): Promise<string> {
        const authClient = this.getAuthClient();
        const requestToken = await authClient.getRequestToken();
        savedRequestTokens[this.accountId] = requestToken;

        return this.getAuthClient().buildAuthoriseUrl(requestToken);
    }

    async xeroAuthenticate(verifier: string): Promise<boolean> {
        if (!verifier) {
            throw Error('Missing verifier argument');
        }

        if (!savedRequestTokens[this.accountId]) {
            return false;
        }

        try {
            const accessToken = await this.getAuthClient().swapRequestTokenforAccessToken(savedRequestTokens[this.accountId], verifier);
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

    async synchronizeChartOfAccounts(payhawkApiKey: string): Promise<void> {
        if (!savedAccessTokens[this.accountId]) {
            throw Error('You are not authenticated');
        }

        const accessToken = savedAccessTokens[this.accountId];
        const xeroClient = new XeroClient(this.getConfig(), accessToken);
        const accountsResponse = await xeroClient.accounts.get({ where: 'Class=="EXPENSE"' });
        const xeroAccounts = accountsResponse.Accounts.map(a => ({
            code: a.Code,
            name: a.Name,
        }));

        // Request to payhawk goes here
        console.log(JSON.stringify(xeroAccounts, undefined, 2));
    }

    private getAuthClient(): IOAuth1HttpClient {
        return new XeroClient(this.getConfig()).oauth1Client;
    }

    private getConfig(): XeroClientConfiguration {
        return {
            ...this.xeroBaseConfig,
            callbackUrl: `${this.serviceConfig.serviceUrl}/callback?accountId=${encodeURIComponent(this.accountId)}`,
        };
    }
}
