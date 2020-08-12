import { Account } from 'xero-node';

export type IAccountCode = Required<Pick<Account, 'name' | 'code'>>;
