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

        await this.saveAccessToken(accessToken);

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
            xeroAccessToken = await this.tryRefreshAccessToken(xeroAccessToken);
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

    async getPayhawkApiKey(): Promise<string> {
        return 'dummy api key';
    }

    private async tryRefreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet | undefined> {
        try {
            if (!currentToken.refresh_token) {
                this.logger.info('Current token is expired and cannot be refreshed. Must re-authenticate.');
                return undefined;
            }

            const refreshedAccessToken = await this.authClient.refreshAccessToken(currentToken);

            if (!refreshedAccessToken) {
                return undefined;
            }

            await this.saveAccessToken(refreshedAccessToken);
            return refreshedAccessToken.tokenSet;
        } catch (err) {
            const error = Error(`Failed to refresh access token - ${err.toString()}`);
            this.logger.error(error);
        }

        return undefined;
    }

    private async saveAccessToken(accessToken: Xero.IAccessToken) {
        await this.store.saveAccessToken({
            account_id: this.accountId,
            tenant_id: accessToken.tenantId,
            user_id: accessToken.xeroUserId,
            token_set: accessToken.tokenSet,
        });
    }
}
