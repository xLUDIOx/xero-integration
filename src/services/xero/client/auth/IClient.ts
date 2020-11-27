import { ITokenSet } from '@shared';

import { ITenant } from '../contracts';

export interface IClient {
    getAuthUrl(): string;
    getAuthorizedTenants(accessToken?: ITokenSet): Promise<ITenant[]>;
    getAccessToken(verifier: string): Promise<ITokenSet>;
    refreshAccessToken(currentToken: ITokenSet): Promise<ITokenSet>;
    disconnect(tenantId: string, currentToken: ITokenSet): Promise<void>;
}
