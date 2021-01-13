import { AccountStatus } from './Account';
import { TaxType } from './TaxRate';

export interface INewAccountCode {
    name: string;
    code: string;
    taxType?: TaxType;
    addToWatchlist?: boolean;
}

export interface IAccountCode extends Required<INewAccountCode> {
    accountId: string;
    status: AccountStatus,
}
