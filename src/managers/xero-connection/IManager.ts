import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

export interface IManager {
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<AccessToken | undefined>;
    getAccessToken(): Promise<AccessToken | undefined>;
}
