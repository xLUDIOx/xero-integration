import { AccessTokenMigrator } from './AccessTokenMigrator';
import { ApiStore } from './ApiStore';
import { IAccessTokenMigrator } from './contracts';

export * from './contracts';

export type IAccessTokenMigratorFactory = () => IAccessTokenMigrator;
export const createMigrator: IAccessTokenMigratorFactory = () => new AccessTokenMigrator(new ApiStore());
