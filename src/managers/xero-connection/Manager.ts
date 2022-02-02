import { AccessTokens, ISchemaStore } from '@data-access';
import { Xero } from '@services';
import { ITokenSet } from '@shared';
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

    getAuthorizationUrl(): string {
        const url = this.authClient.getAuthUrl();
        return url;
    }

    async authenticate(authCode: string): Promise<ITokenSet> {
        const accessToken = await this.authClient.getAccessTokenFromCode(authCode);
        return accessToken;
    }

    async createAccount(tenantId: string): Promise<void> {
        await this.store.accounts.create({
            account_id: this.accountId,
            tenant_id: tenantId,
            initial_sync_completed: false,
        });
    }

    async getAccessToken(): Promise<ITokenSet | undefined> {
        const xeroAccessTokenRecord = await this.store.accessTokens.getByAccountId(this.accountId);
        if (xeroAccessTokenRecord === undefined) {
            return undefined;
        }

        const xeroAccessToken = xeroAccessTokenRecord.token_set;
        const isExpired = isAccessTokenExpired(xeroAccessToken);
        if (!isExpired) {
            return xeroAccessToken;
        }

        if (!Xero.hasScope(Xero.XeroScope.RefreshTokens)) {
            this.logger.info('Refresh tokens scope is not enabled');
            return undefined;
        }

        return this.tryRefreshAccessToken(xeroAccessToken, xeroAccessTokenRecord.tenant_id);
    }

    async getAuthorizedTenants(accessToken: ITokenSet): Promise<Xero.ITenant[]> {
        return this.authClient.getAuthorizedTenants(accessToken);
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
            this.logger.child({ tenantId, err }).info('Failed to disconnect tenant');
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

    private async tryRefreshAccessToken(currentToken: ITokenSet, tenantId: string): Promise<ITokenSet | undefined> {
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
        } catch (err: any) {
            const error = Error(`Failed to refresh access token - ${err.toString()}`);
            this.logger.error(error);
        }

        return undefined;
    }

    async createAccessToken(accessToken: ITokenSet, tenantId: string) {
        const xeroUserId = extractXeroUserIdFromToken(accessToken);

        await this.store.accessTokens.create({
            account_id: this.accountId,
            tenant_id: tenantId,
            user_id: xeroUserId,
            token_set: accessToken,
        });
    }

    private async updateAccessToken(tenantId: string, accessToken: ITokenSet) {
        await this.store.accessTokens.updateToken(this.accountId, tenantId, accessToken);
    }
}

export const isAccessTokenExpired = (accessToken: ITokenSet): boolean => {
    // be on the safe side
    // an action like an export in Xero
    // might take up to half a minute
    // which is risky if the token has
    // e.g. 15 sec left in it
    return !accessToken.expires_in || !Number.isInteger(accessToken.expires_in) || accessToken.expires_in <= MIN_EXPIRATION_TIME;
};

function extractXeroUserIdFromToken(tokenSet: ITokenSet): string {
    const tokenPayload = AccessTokens.parseToken(tokenSet);
    if (!tokenPayload) {
        throw Error('Could not parse token payload. Unable to extract Xero user ID');
    }

    const xeroUserId = tokenPayload.xero_userid;
    return xeroUserId;
}

const MIN_EXPIRATION_TIME = 60; // seconds
