import { KeyNameMap } from '../../utils';

export interface INewPayhawkApiKeyRecord {
    account_id: string;
    key: string;
}

export interface IPayhawkApiKeyRecord extends INewPayhawkApiKeyRecord {
    created_at: Date;
    updated_at: Date;
}

export const PayhawkApiKeyRecordKeys: KeyNameMap<IPayhawkApiKeyRecord> = {
    created_at: 'created_at',
    updated_at: 'updated_at',
    account_id: 'account_id',
    key: 'key',
};
