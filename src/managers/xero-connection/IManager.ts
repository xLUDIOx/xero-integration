import { Xero } from '@services';
import { ITokenSet } from '@shared';

export interface IManager {
    getAuthorizationUrl(): string;
    authenticate(authCode: string): Promise<ITokenSet | undefined>;
    getAccessToken(): Promise<ITokenSet | undefined>;
    createAccount(tenantId: string): Promise<void>;
    getAuthorizedTenants(accessToken: ITokenSet): Promise<Xero.ITenant[]>;
    getActiveTenantId(): Promise<string | undefined>;
    connectTenant(tenantId: string): Promise<void>;
    disconnectActiveTenant(): Promise<void>;

    getPayhawkApiKey(): Promise<string>;
    setPayhawkApiKey(key: string): Promise<void>;
}
