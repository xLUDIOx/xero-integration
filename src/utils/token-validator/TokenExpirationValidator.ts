import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

export function isTokenExpired(accessToken: AccessToken): boolean {
    const result = accessToken.oauth_expires_at !== undefined && new Date(accessToken.oauth_expires_at) < new Date();
    return result;
}
