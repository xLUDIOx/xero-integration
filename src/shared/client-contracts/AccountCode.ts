import { AccountStatus } from './Account';

export interface INewAccountCode {
    name: string;
    code: string;
    addToWatchlist?: boolean;
}

export interface IAccountCode extends Required<INewAccountCode> {
    accountId: string;
    status: AccountStatus,
}
