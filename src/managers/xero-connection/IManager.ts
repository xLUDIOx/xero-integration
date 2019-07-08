import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

export interface IManager {
    isAuthenticated(): boolean;
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<boolean>;
    getAccessToken(): AccessToken;
}
