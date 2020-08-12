import { ITokenSet } from '../../../store';

export interface IAuth {
    getAuthUrl(): Promise<string>;
    getAccessToken(verifier: string): Promise<IAccessToken>;
    refreshAccessToken(currentToken?: ITokenSet): Promise<IAccessToken | undefined>;
}

export interface IAccessToken {
    xeroUserId: string;
    tenantId: string;
    tokenSet: ITokenSet;
}
