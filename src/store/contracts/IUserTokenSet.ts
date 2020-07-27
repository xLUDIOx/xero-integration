import { KeyNameMap } from '../../utils';
import { IDbRecord } from './IDbRecord';

export interface INewUserTokenSetRecord {
    account_id: string;
    user_id: string;
    tenant_id: string;
    token_set: ITokenSet;
}

export interface ITokenSet {
    access_token: string;
    refresh_token: string;
    expires_in: string;
    token_type: 'Bearer';
    xero_tenant_id: string;
}

export type IUserTokenSetRecord = INewUserTokenSetRecord & IDbRecord;

export const UserTokenSetRecordKeys: KeyNameMap<IUserTokenSetRecord> = {
    id: 'id',
    created_at: 'created_at',
    token_set: 'token_set',
    updated_at: 'updated_at',
    user_id: 'user_id',
    account_id: 'account_id',
    tenant_id: 'tenant_id',
};
