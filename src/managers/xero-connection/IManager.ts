import { AccessTokens } from '@stores';

export interface IManager {
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<AccessTokens.ITokenSet | undefined>;
    getAccessToken(): Promise<AccessTokens.ITokenSet | undefined>;
    getActiveTenantId(): Promise<string | undefined>;
    disconnectActiveTenant(): Promise<void>;

    getPayhawkApiKey(): Promise<string>;
    setPayhawkApiKey(key: string): Promise<void>;
}
