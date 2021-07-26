import { TokenSet } from 'openid-client';

import { IEnvironment } from '@environment';
import { ITokenSet } from '@shared';
import { ILogger } from '@utils';

import { IXeroClientConfig } from '../../Config';
import { IHttpClient } from '../../http';
import { buildUrl, toUrlParams } from '../../shared';
import { ITenant } from '../contracts';
import { IClient } from './IClient';

export class Client implements IClient {
    constructor(
        private readonly httpClient: IHttpClient,
        private readonly config: IXeroClientConfig,
        private readonly logger: ILogger,
        private readonly env: IEnvironment,
    ) {
    }

    getAuthUrl(): string {
        return buildUrl(
            this.env.xeroLoginUrl,
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

    async getAccessToken(code: string): Promise<ITokenSet> {
        const url = buildUrl(
            this.env.xeroAuthUrl,
            '/connect/token',
        );

        const result = await this.httpClient.request<ITokenSet>({
            url,
            method: 'POST',
            authorization: {
                basic: {
                    user: this.config.clientId,
                    secret: this.config.clientSecret,
                },
            },
            contentType: 'application/x-www-form-urlencoded',
            data: toUrlParams(
                {
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: this.config.redirectUris[0],
                }
            ),
        });

        const accessToken = new TokenSet(result);
        return accessToken;
    }

    async getAuthorizedTenants(accessToken?: ITokenSet): Promise<ITenant[]> {
        if (accessToken && accessToken.access_token === undefined) {
            throw Error('Access token is undefined');
        }

        const url = buildUrl(
            this.env.xeroApiUrl,
            '/connections',
        );

        const authorization = accessToken ? { authToken: accessToken.access_token! } : undefined;

        const tenants = await this.httpClient.request({
            url,
            method: 'GET',
            authorization,
        });

        return tenants;
    }

    async refreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet> {
        const url = buildUrl(
            this.env.xeroAuthUrl,
            '/connect/token',
        );

        const result = await this.httpClient.request<ITokenSet>({
            url,
            method: 'POST',
            authorization: {
                basic: {
                    user: this.config.clientId,
                    secret: this.config.clientSecret,
                },
            },
            contentType: 'application/x-www-form-urlencoded',
            data: toUrlParams(
                {
                    grant_type: 'refresh_token',
                    refresh_token: currentToken.refresh_token,
                }
            ),
        });

        const accessToken = new TokenSet(result);
        return accessToken;
    }

    async disconnect(tenantId: string, currentToken: ITokenSet): Promise<void> {
        if (currentToken.access_token === undefined) {
            throw Error('Access token is undefined');
        }

        const tenants = await this.getAuthorizedTenants(currentToken);

        const connection = tenants.find(t => t.tenantId === tenantId);
        if (!connection) {
            this.logger.info('Connection has been terminated remotely');
            return;
        }

        const url = buildUrl(
            this.env.xeroApiUrl,
            `/connections/${connection.id}`,
        );

        await this.httpClient.request({
            url,
            method: 'DELETE',
            authorization: {
                authToken: currentToken.access_token,
            },
        });
    }
}
