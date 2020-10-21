import { Account } from 'xero-node';

export type IBankAccount = Required<Pick<Account, 'name' | 'accountID' | 'code' | 'currencyCode' | 'bankAccountNumber' | 'status' | 'type'>>;
