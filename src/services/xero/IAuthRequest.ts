import { RequestToken } from 'xero-node/lib/internals/OAuth1HttpClient';

export interface IAuthRequest {
    requestToken: RequestToken;
    url: string;
}
