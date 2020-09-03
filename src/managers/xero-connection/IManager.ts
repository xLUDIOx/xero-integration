import { ITokenSet } from '../../store';

export interface IManager {
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<ITokenSet | undefined>;
    getAccessToken(): Promise<ITokenSet | undefined>;
    getActiveTenantId(): Promise<string>;
    getPayhawkApiKey(): Promise<string>;
    setPayhawkApiKey(key: string): Promise<void>;
}
