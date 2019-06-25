import { AccountingAPIClient as XeroClient } from 'xero-node';
import { XeroClientConfiguration } from 'xero-node/lib/internals/BaseAPIClient';
import { AccessToken, IOAuth1HttpClient, RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';
import { IManager } from '.';
import { IAccount } from './IAccount';

// tslint:disable-next-line: no-var-requires
const baseConfig: XeroClientConfiguration = require('../../../config.json');

const savedRequestTokens: { [accountId: string]: RequestToken } = {};
const savedAccessTokens: { [accountId: string]: AccessToken } = {};

export class Manager implements IManager {
    constructor(private readonly accountId: string) { }

    async getAuthorizationUrl(): Promise<string> {
        const authClient = this.getAuthClient();
        const requestToken = await authClient.getRequestToken();
        savedRequestTokens[this.accountId] = requestToken;

        return this.getAuthClient().buildAuthoriseUrl(requestToken);
    }

    async authenticate(verifier: string): Promise<void> {
        if (!verifier) {
            throw Error('Missing verifier argument');
        }

        if (!savedRequestTokens[this.accountId]) {
            throw Error('Missing request token. Did you call getAuthorizationUrl()?');
        }

        const accessToken = await this.getAuthClient().swapRequestTokenforAccessToken(savedRequestTokens[this.accountId], verifier);
        savedAccessTokens[this.accountId] = accessToken;
    }

    async getChartOfAccounts(): Promise<IAccount[]> {
        if (!savedAccessTokens[this.accountId]) {
            throw Error('You are not authenticated');
        }

        const accessToken = savedAccessTokens[this.accountId];
        const xeroClient = new XeroClient(this.getConfig(), accessToken);
        const accountsResponse = await xeroClient.accounts.get({ where: 'Class=="EXPENSE"' });
        return accountsResponse.Accounts.map(a => ({
            code: a.Code,
            name: a.Name,
        }));
    }

    private getAuthClient(): IOAuth1HttpClient {
        return new XeroClient(this.getConfig()).oauth1Client;
    }

    private getConfig(): XeroClientConfiguration {
        return {
            ...baseConfig as XeroClientConfiguration,
            callbackUrl: `http://localhost:8080/accounts/${encodeURIComponent(this.accountId)}/callback`,
        };
    }
}
