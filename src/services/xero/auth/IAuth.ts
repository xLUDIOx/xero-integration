import { ITokenSet } from '@shared';

import { ITenant } from '../client';

export interface IAuth {
    getAuthUrl(): string;
    getAccessToken(code: string): Promise<IAccessToken>;
    getAuthorizedTenants(accessToken: ITokenSet): Promise<ITenant[]>;
    refreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet>;
    disconnect(tenantId: string, currentToken: ITokenSet): Promise<void>;
}

export interface IAccessToken {
    xeroUserId: string;
    tenantId: string;
    tokenSet: ITokenSet;
}
