import { INewUserTokenSetRecord, IUserTokenSetRecord } from './IUserTokenSet';

export interface IStore {
    saveAccessToken(record: INewUserTokenSetRecord): Promise<void>;
    getAccessToken(accountId: string): Promise<IUserTokenSetRecord | undefined>;
    getApiKey(accountId: string): Promise<string|undefined>;
    setApiKey(accountId: string, key: string): Promise<void>;
}
