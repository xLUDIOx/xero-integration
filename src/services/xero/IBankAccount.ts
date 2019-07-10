import { BankAccount } from 'xero-node/lib/AccountingAPI-models';

export interface IBankAccount extends BankAccount {
    Status: 'ACTIVE'|'ARCHIVED';
}
