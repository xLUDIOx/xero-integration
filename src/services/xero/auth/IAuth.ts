import { ITokenSet } from '@shared';

import { ITenant } from '../client';

export interface IAuth {
    getAuthUrl(): string;
    getAccessTokenFromCode(code: string): Promise<ITokenSet>;
    getAuthorizedTenants(accessToken: ITokenSet): Promise<ITenant[]>;
    refreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet>;
    disconnect(tenantId: string, currentToken: ITokenSet): Promise<void>;
}
