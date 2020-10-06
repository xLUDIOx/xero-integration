import { Xero } from '../../services';
import { IStore, ITokenSet } from '../../store';
import { ILogger } from '../../utils';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly store: IStore,
        private readonly authClient: Xero.IAuth,
        private readonly accountId: string,
        private readonly logger: ILogger,
    ) {
    }

    async getAuthorizationUrl(): Promise<string> {
        const url = await this.authClient.getAuthUrl();
        return url;
    }

    async authenticate(verifier: string): Promise<ITokenSet | undefined> {
        const accessToken = await this.authClient.getAccessToken(verifier);

        await this.createAccessToken(accessToken);

        return accessToken.tokenSet;
    }

    async getAccessToken(): Promise<ITokenSet | undefined> {
        const xeroAccessTokenRecord = await this.store.getAccessToken(this.accountId);
        if (xeroAccessTokenRecord === undefined) {
            return undefined;
        }

        let xeroAccessToken: ITokenSet | undefined = xeroAccessTokenRecord.token_set;

        const isExpired = xeroAccessToken.expired();
        if (isExpired) {
            xeroAccessToken = await this.tryRefreshAccessToken(xeroAccessToken, xeroAccessTokenRecord.tenant_id);
        }

        return xeroAccessToken;
    }

    async getActiveTenantId(): Promise<string> {
        const xeroAccessTokenRecord = await this.store.getAccessToken(this.accountId);
        if (xeroAccessTokenRecord === undefined) {
            throw Error('Unable to get active tenant ID because token is undefined');
        }

        return xeroAccessTokenRecord.tenant_id;
    }

    async disconnectActiveTenant(): Promise<void> {
        const tenantId = await this.getActiveTenantId();

        try {
            const accessToken = await this.getAccessToken();
            if (accessToken) {
                await this.authClient.disconnect(tenantId, accessToken);
            }
        } catch (err) {
            this.logger.error(err);
        } finally {
            await this.store.deleteAccessToken(tenantId);
        }
    }

    async getPayhawkApiKey(): Promise<string> {
        const result = await this.store.getApiKey(this.accountId);
        if (!result) {
            throw Error('No API key for account');
        } else {
            return result;
        }
    }

    async setPayhawkApiKey(key: string): Promise<void> {
        await this.store.setApiKey(this.accountId, key);
    }

    private async tryRefreshAccessToken(currentToken: ITokenSet, tenantId: string): Promise<ITokenSet | undefined> {
        try {
            if (!currentToken.refresh_token) {
                this.logger.info('Refresh token is missing. Must re-authenticate.');
                return undefined;
            }

            const refreshedAccessToken = await this.authClient.refreshAccessToken(currentToken, tenantId);
            if (!refreshedAccessToken) {
                return undefined;
            }

            await this.updateAccessToken(refreshedAccessToken);
            return refreshedAccessToken.tokenSet;
        } catch (err) {
            const error = Error(`Failed to refresh access token - ${err.toString()}`);
            this.logger.error(error);
        }

        return undefined;
    }

    private async createAccessToken(accessToken: Xero.IAccessToken) {
        await this.store.createAccessToken({
            account_id: this.accountId,
            tenant_id: accessToken.tenantId,
            user_id: accessToken.xeroUserId,
            token_set: accessToken.tokenSet,
        });
    }

    private async updateAccessToken(accessToken: Xero.IAccessToken) {
        await this.store.updateAccessToken(
            this.accountId,
            {
                user_id: accessToken.xeroUserId,
                token_set: accessToken.tokenSet,
            },
        );
    }
}
