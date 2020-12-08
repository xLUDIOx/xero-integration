import { ITokenSet } from '@shared';

import { config } from './Config';

export * from './auth';
export * from './client';

export enum XeroScope {
    BankFeeds = 'bankfeeds',
    RefreshTokens = 'offline_access',
}

export const isAccessTokenAuthorizedForScope = (accessToken: ITokenSet, scope: XeroScope): boolean => {
    return accessToken.scope ? accessToken.scope.includes(scope) : false;
};

export const hasScope = (scope: XeroScope): boolean => {
    return config.scopes ? config.scopes.includes(scope) : false;
};
