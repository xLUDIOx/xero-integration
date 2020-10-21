import { KeyNameMap } from '@utils';

export interface IBankFeedConnectionRecord {
    account_id: string;
    bank_connection_id: string;
    currency: string;
}

export const BankFeedConnectionRecordKeys: KeyNameMap<IBankFeedConnectionRecord> = {
    account_id: 'account_id',
    bank_connection_id: 'bank_connection_id',
    currency: 'currency',
};
