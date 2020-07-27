import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

export interface IAccessTokenRecord {
    account_id: string;
    access_token: AccessToken;
}
