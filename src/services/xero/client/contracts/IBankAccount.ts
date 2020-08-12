import { Account } from 'xero-node';

export type IBankAccount = Required<Pick<Account, 'name' | 'accountID' | 'currencyCode' | 'bankAccountNumber' | 'status' | 'type'>>;
