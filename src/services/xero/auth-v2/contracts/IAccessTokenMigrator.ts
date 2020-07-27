import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { IMigratedAuthTokenSet } from './IMigratedAuthTokenSet';

export interface IAccessTokenMigrator {
    migrate(accessToken: AccessToken): Promise<IMigratedAuthTokenSet>
}
