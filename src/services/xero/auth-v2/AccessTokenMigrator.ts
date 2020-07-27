import * as fs from 'fs';

import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { getXeroConfig, getXeroConfigV2 } from '../Config';
import { IAccessTokenMigrator, IApiStore, IMigratedAuthTokenSet } from './contracts';

export class AccessTokenMigrator implements IAccessTokenMigrator {
    constructor(private readonly store: IApiStore) { }

    async migrate(accessToken: AccessToken): Promise<IMigratedAuthTokenSet> {
        const { consumerKey, privateKeyPath } = getXeroConfig('');
        if (!privateKeyPath) {
            throw Error('Private key is mandatory for token migration');
        }

        const { clientId, clientSecret, scopes } = getXeroConfigV2('');

        const tokenString = accessToken.oauth_token;
        const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');

        const scope = scopes.join(' ');
        return this.store.migrateToken(
            {
                accessToken: tokenString,
                clientId,
                clientSecret,
                scope,
                consumerKey,
                privateKey,
            });
    }
}
