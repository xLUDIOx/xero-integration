import { TokenSet } from 'openid-client';

import { KeyNameMap } from '../CommonTypes';

export interface INewUserTokenSetRecord {
    account_id: string;
    user_id: string;
    tenant_id: string;
    token_set: ITokenSet;
}

export type ITokenSet = TokenSet;

export interface IUserTokenSetRecord extends INewUserTokenSetRecord {
    created_at: Date;
    updated_at: Date;
}

export const UserTokenSetRecordKeys: KeyNameMap<IUserTokenSetRecord> = {
    created_at: 'created_at',
    token_set: 'token_set',
    updated_at: 'updated_at',
    user_id: 'user_id',
    account_id: 'account_id',
    tenant_id: 'tenant_id',
};
