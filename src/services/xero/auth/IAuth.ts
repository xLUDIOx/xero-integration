import { AccessTokens } from '@stores';

export interface IAuth {
    getAuthUrl(): Promise<string>;
    getAccessToken(verifier: string): Promise<IAccessToken>;
    refreshAccessToken(currentToken: AccessTokens.ITokenSet): Promise<AccessTokens.ITokenSet>;
    disconnect(tenantId: string, currentToken: AccessTokens.ITokenSet): Promise<void>;
}

export interface IAccessToken {
    xeroUserId: string;
    tenantId: string;
    tokenSet: AccessTokens.ITokenSet;
}
