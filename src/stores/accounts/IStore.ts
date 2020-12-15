import { IAccountRecord } from '@shared';

export interface IStore {
    get(accountId: string): Promise<IAccountRecord | undefined>;
    update(accountId: string, isSynced: boolean): Promise<void>;
    upsert(record: IAccountRecord): Promise<void>;
}
