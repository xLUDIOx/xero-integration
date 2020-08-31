import { Account } from 'xero-node';

export type IAccountCode = Required<Pick<Account, 'accountID' | 'name' | 'code' | 'status' | 'addToWatchlist'>>;
export type INewAccountCode = Required<Pick<Account, 'name' | 'code'>> & Pick<Account, 'addToWatchlist'>
