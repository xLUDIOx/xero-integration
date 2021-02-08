import { Xero } from '@services';
import { ITokenSet } from '@shared';

export interface IManager {
    authenticate(authCode: string): Promise<ITokenSet>;

    getAuthorizationUrl(): string;
    getAccessToken(): Promise<ITokenSet | undefined>;
    createAccessToken(accessToken: ITokenSet, tenantId: string): Promise<void>;
    createAccount(tenantId: string): Promise<void>;
    getAuthorizedTenants(accessToken: ITokenSet): Promise<Xero.ITenant[]>;
    getActiveTenantId(): Promise<string | undefined>;
    disconnectActiveTenant(): Promise<void>;

    getPayhawkApiKey(): Promise<string>;
    setPayhawkApiKey(key: string): Promise<void>;
}
