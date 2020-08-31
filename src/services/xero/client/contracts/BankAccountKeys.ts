import { Account } from 'xero-node';

import { KeyNameMap } from '../../../../utils';

export const AccountKeys: KeyNameMap<Pick<Account, 'accountID' | 'currencyCode' | 'code' | 'type' | 'status'>> = {
    accountID: 'accountID',
    code: 'code',
    currencyCode: 'currencyCode',
    type: 'type',
    status: 'status',
};
