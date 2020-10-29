import { AccessTokens } from '@stores';

import { ITenant } from '../client';

export interface IAuth {
    getAuthUrl(): Promise<string>;
    getAccessToken(verifier: string): Promise<IAccessToken>;
    getAuthorizedTenants(accessToken: AccessTokens.ITokenSet): Promise<ITenant[]>;
    refreshAccessToken(currentToken: AccessTokens.ITokenSet): Promise<AccessTokens.ITokenSet>;
    disconnect(tenantId: string, currentToken: AccessTokens.ITokenSet): Promise<void>;
}

export interface IAccessToken {
    xeroUserId: string;
    tenantId: string;
    tokenSet: AccessTokens.ITokenSet;
}
