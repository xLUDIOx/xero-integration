import { ITokenSet } from '../../store';

export interface IManager {
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<ITokenSet | undefined>;
    getAccessToken(): Promise<ITokenSet | undefined>;
    getActiveTenantId(): Promise<string>;
    disconnectActiveTenant(): Promise<void>;

    getPayhawkApiKey(): Promise<string>;
    setPayhawkApiKey(key: string): Promise<void>;
}
