import { INewUserTokenSetRecord, ITokenSet, IUserTokenSetRecord } from './IUserTokenSet';

export interface IStore {
    createAccessToken(record: INewUserTokenSetRecord): Promise<void>;
    updateAccessToken(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void>;
    getAccessToken(accountId: string): Promise<IUserTokenSetRecord | undefined>;
    deleteAccessToken(accountId: string): Promise<void>;
    getApiKey(accountId: string): Promise<string|undefined>;
    setApiKey(accountId: string, key: string): Promise<void>;
}
