import { KeyNameMap } from '@shared';

export interface IBankFeedStatementRecord {
    account_id: string;
    xero_entity_id?: string | null;
    payhawk_entity_id: string;
    payhawk_entity_type: EntityType;
    bank_statement_id: string;
}

export enum EntityType {
    Expense = 'expense',
    BalancePayment = 'balance-payment',
    Transaction = 'transaction',
    Transfer = 'transfer'
}

export const BankFeedStatementRecordKeys: KeyNameMap<IBankFeedStatementRecord> = {
    account_id: 'account_id',
    xero_entity_id: 'xero_entity_id',
    bank_statement_id: 'bank_statement_id',
    payhawk_entity_id: 'payhawk_entity_id',
    payhawk_entity_type: 'payhawk_entity_type',
};
