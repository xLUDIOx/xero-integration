import { KeyNameMap } from '../CommonTypes';

export interface IAccountRecord {
    account_id: string;
    tenant_id: string;
    initial_sync_completed: boolean;
}

export const AccountRecordKeys: KeyNameMap<IAccountRecord> = {
    account_id: 'account_id',
    initial_sync_completed: 'initial_sync_completed',
    tenant_id: 'tenant_id',
};
