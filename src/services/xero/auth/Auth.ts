import { ITokenSet } from '@shared';

import { AuthClient, ITenant } from '../client';
import { IAuth } from './IAuth';

export class Auth implements IAuth {
    constructor(
        private readonly client: AuthClient.IClient,
    ) {
    }

    getAuthUrl(): string {
        return this.client.getAuthUrl();
    }

    async getAccessTokenFromCode(code: string): Promise<ITokenSet> {
        const accessToken = await this.client.getAccessToken(code);
        return accessToken;
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
}
