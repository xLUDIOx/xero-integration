import { IMigratedAuthTokenSet } from './IMigratedAuthTokenSet';
import { IMigrationRequestData } from './IMigrationRequestData';

export interface IApiStore {
    migrateToken(tokenData: IMigrationRequestData): Promise<IMigratedAuthTokenSet>;
}
