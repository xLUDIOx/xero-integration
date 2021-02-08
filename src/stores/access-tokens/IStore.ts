import { INewUserTokenSetRecord, ITokenSet, IUserTokenSetRecord } from '@shared';

export interface IStore {
    create(record: INewUserTokenSetRecord): Promise<void>;
    updateToken(accountId: string, tenantId: string, tokenSet: ITokenSet): Promise<void>;
    getByAccountId(accountId: string): Promise<IUserTokenSetRecord | undefined>;
    delete(accountId: string): Promise<void>;
}
