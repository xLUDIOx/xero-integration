import { Xero } from '@services';
import { AccessTokens } from '@stores';

export interface IManager {
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<AccessTokens.ITokenSet | undefined>;
    getAccessToken(): Promise<AccessTokens.ITokenSet | undefined>;
    getAuthorizedTenants(): Promise<Xero.ITenant[]>;
    getActiveTenantId(): Promise<string | undefined>;
    connectTenant(tenantId: string): Promise<void>;
    disconnectActiveTenant(): Promise<void>;

    getPayhawkApiKey(): Promise<string>;
    setPayhawkApiKey(key: string): Promise<void>;
}
