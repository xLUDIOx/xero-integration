import { IXeroClientConfig, XeroClient } from 'xero-node';

import { AccessTokens } from '@stores';
import { ILock, ILogger } from '@utils';

import { ITenant } from '../client';
import { getXeroConfig } from '../Config';
import { createXeroHttpClient, IXeroHttpClient } from '../http';
import { buildUrl } from '../shared';
import { IAccessToken, IAuth } from './IAuth';

export class Auth implements IAuth {
    private readonly config: IXeroClientConfig;

    constructor(
        private readonly accountId: string,
        private readonly returnUrl: string | undefined,
        private readonly lock: ILock,
        private readonly logger: ILogger,
    ) {
        this.config = getXeroConfig(this.accountId, this.returnUrl);
    }

    async getAuthUrl(): Promise<string> {
        return buildUrl(
            'https://login.xero.com',
            '/identity/connect/authorize',
            {
                response_type: 'code',
                client_id: this.config.clientId,
                redirect_uri: this.config.redirectUris[0],
                scope: this.config.scopes.join(' '),
                state: this.config.state,
            }
        );
    }

    async getAccessToken(verifier: string): Promise<IAccessToken> {
        const authClient = await this.createClient();

        const tokenSet = await authClient.makeClientRequest<AccessTokens.ITokenSet>(x => x.apiCallback(verifier));
        return buildAccessTokenData(authClient, tokenSet);
    }

    async getAuthorizedTenants(accessToken: AccessTokens.ITokenSet): Promise<ITenant[]> {
        const authClient = await this.createClient(accessToken);
        const tenants = await authClient.makeClientRequest<ITenant[]>(x => x.updateTenants(false));
        return tenants;
    }

    async refreshAccessToken(currentToken: AccessTokens.ITokenSet): Promise<AccessTokens.ITokenSet> {
        const authClient = await this.createClient(currentToken);
        const newToken = await authClient.makeClientRequest<AccessTokens.ITokenSet>(x => x.refreshToken());
        return newToken;
    }

    async disconnect(tenantId: string, currentToken: AccessTokens.ITokenSet): Promise<void> {
        const authClient = await this.createClient(currentToken);
        const tenants = await authClient.makeClientRequest<ITenant[]>(x => x.updateTenants(false));

        const connection = tenants.find(t => t.tenantId === tenantId);
        if (!connection) {
            this.logger.info('Connection has been terminated remotely');
            return;
        }

        await authClient.makeClientRequest(x => x.disconnect(connection.id));
    }

    private async createClient(accessToken?: AccessTokens.ITokenSet): Promise<IXeroHttpClient> {
        const client = new XeroClient(this.config);
        const httpClient = createXeroHttpClient(client, this.lock, this.logger);

        await httpClient.makeClientRequest(x => x.initialize());

        if (accessToken) {
            client.setTokenSet(accessToken);
        }

        return httpClient;
    }
}

export async function buildAccessTokenData(client: IXeroHttpClient, tokenSet: AccessTokens.ITokenSet): Promise<IAccessToken> {
    const tenants = await client.makeClientRequest<ITenant[]>(x => x.updateTenants());
    if (tenants.length === 0) {
        throw Error('Client did not load tenants. Unable to extract Xero active tenant ID');
    }

    const tokenPayload = AccessTokens.parseToken(tokenSet);
    if (!tokenPayload) {
        throw Error('Could not parse token payload. Unable to extract Xero user ID');
    }

    const xeroUserId = tokenPayload.xero_userid;
    const tenantId = tenants[0].tenantId;

    return {
        xeroUserId,
        tenantId,
        tokenSet,
    };
}
