import { ITokenSet } from '@shared';
import { AccessTokens } from '@stores';

import { AuthClient, ITenant } from '../client';
import { IAccessToken, IAuth } from './IAuth';

export class Auth implements IAuth {
    constructor(
        private readonly client: AuthClient.IClient,
    ) {
    }

    getAuthUrl(): string {
        return this.client.getAuthUrl();
    }

    async getAccessToken(code: string): Promise<IAccessToken> {
        const accessToken = await this.client.getAccessToken(code);
        return this.buildAccessTokenData(accessToken);
    }

    async getAuthorizedTenants(accessToken: ITokenSet): Promise<ITenant[]> {
        return this.client.getAuthorizedTenants(accessToken);
    }

    async refreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet> {
        return this.client.refreshAccessToken(currentToken);
    }

    async disconnect(tenantId: string, currentToken: ITokenSet): Promise<void> {
        return this.client.disconnect(tenantId, currentToken);
    }

    private async buildAccessTokenData(tokenSet: ITokenSet): Promise<IAccessToken> {
        const tenants = await this.getAuthorizedTenants(tokenSet);
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
}
