import { Xero } from '@services';
import { AccessTokens, ISchemaStore } from '@stores';
import { ILogger } from '@utils';

import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly store: ISchemaStore,
        private readonly authClient: Xero.IAuth,
        private readonly accountId: string,
        private readonly logger: ILogger,
    ) {
    }

    async getAuthorizationUrl(): Promise<string> {
        const url = await this.authClient.getAuthUrl();
        return url;
    }

    async authenticate(verifier: string): Promise<AccessTokens.ITokenSet | undefined> {
        const accessToken = await this.authClient.getAccessToken(verifier);

        await this.createAccessToken(accessToken);

        return accessToken.tokenSet;
    }

    async getAccessToken(): Promise<AccessTokens.ITokenSet | undefined> {
        const xeroAccessTokenRecord = await this.store.accessTokens.getByAccountId(this.accountId);
        if (xeroAccessTokenRecord === undefined) {
            return undefined;
        }

        let xeroAccessToken: AccessTokens.ITokenSet | undefined = xeroAccessTokenRecord.token_set;

        const isExpired = xeroAccessToken.expired();
        if (isExpired) {
            xeroAccessToken = await this.tryRefreshAccessToken(xeroAccessToken, xeroAccessTokenRecord.tenant_id);
        }

        return xeroAccessToken;
    }

    async getActiveTenantId(): Promise<string | undefined> {
        const xeroAccessTokenRecord = await this.store.accessTokens.getByAccountId(this.accountId);
        if (xeroAccessTokenRecord === undefined) {
            return undefined;
        }

        return xeroAccessTokenRecord.tenant_id;
    }

    async disconnectActiveTenant(): Promise<void> {
        const tenantId = await this.getActiveTenantId();
        if (!tenantId) {
            this.logger.info('No active tenant found for this account, nothing to do here');
            return;
        }

        try {
            const accessToken = await this.getAccessToken();
            if (accessToken) {
                await this.authClient.disconnect(tenantId, accessToken);
            }
        } catch (err) {
            this.logger.error(err);
        } finally {
            await this.store.accessTokens.delete(tenantId);
        }
    }

    async getPayhawkApiKey(): Promise<string> {
        const result = await this.store.apiKeys.getByAccountId(this.accountId);
        if (!result) {
            throw Error('No API key for account');
        } else {
            return result;
        }
    }

    async setPayhawkApiKey(key: string): Promise<void> {
        await this.store.apiKeys.set({ account_id: this.accountId, key });
    }

    private async tryRefreshAccessToken(currentToken: AccessTokens.ITokenSet, tenantId: string): Promise<AccessTokens.ITokenSet | undefined> {
        try {
            if (!currentToken.refresh_token) {
                this.logger.info('Refresh token is missing. Must re-authenticate.');
                return undefined;
            }

            const refreshedAccessToken = await this.authClient.refreshAccessToken(currentToken);
            if (!refreshedAccessToken) {
                return undefined;
            }

            await this.updateAccessToken(tenantId, refreshedAccessToken);

            return refreshedAccessToken;
        } catch (err) {
            const error = Error(`Failed to refresh access token - ${err.toString()}`);
            this.logger.error(error);
        }

        return undefined;
    }

    private async createAccessToken(accessToken: Xero.IAccessToken) {
        await this.store.accessTokens.create({
            account_id: this.accountId,
            tenant_id: accessToken.tenantId,
            user_id: accessToken.xeroUserId,
            token_set: accessToken.tokenSet,
        });
    }

    private async updateAccessToken(tenantId: string, accessToken: AccessTokens.ITokenSet) {
        await this.store.accessTokens.update(this.accountId, tenantId, accessToken);
    }
}
