import { INewPayhawkApiKeyRecord } from './IPayhawkApiKey';

export interface IStore {
    getByAccountId(accountId: string): Promise<string | undefined>;
    set(newRecord: INewPayhawkApiKeyRecord): Promise<void>;
}
