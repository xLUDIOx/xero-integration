import { INewUserTokenSetRecord, ITokenSet, IUserTokenSetRecord } from './IUserTokenSet';

export interface IStore {
    create(record: INewUserTokenSetRecord): Promise<void>;
    update(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void>;
    getByAccountId(accountId: string): Promise<IUserTokenSetRecord | undefined>;
    delete(accountId: string): Promise<void>;
}
