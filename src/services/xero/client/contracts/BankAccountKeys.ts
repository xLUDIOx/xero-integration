import { KeyNameMap } from '../../../../utils';
import { IBankAccount } from './IBankAccount';

export const BankAccountKeys: KeyNameMap<Pick<Required<IBankAccount>, 'AccountID' | 'CurrencyCode' | 'Code' | 'Type' | 'Status'>> = {
    AccountID: 'AccountID',
    Code: 'Code',
    CurrencyCode: 'CurrencyCode',
    Type: 'Type',
    Status: 'Status',
};
