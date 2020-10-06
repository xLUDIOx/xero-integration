import { ITokenSet } from '../../../store';

export interface IAuth {
    getAuthUrl(): Promise<string>;
    getAccessToken(verifier: string): Promise<IAccessToken>;
    refreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet>;
    disconnect(tenantId: string, currentToken: ITokenSet): Promise<void>;
}

export interface IAccessToken {
    xeroUserId: string;
    tenantId: string;
    tokenSet: ITokenSet;
}
