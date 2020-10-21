import { Xero } from '@services';
import { AccessTokens } from '@stores';
import { ILogger } from '@utils';

import { IManager } from './IManager';
import { getBillExternalUrl, getTransactionExternalUrl, Manager } from './Manager';

export { IManager, getBillExternalUrl, getTransactionExternalUrl };
export * from './IAccountCode';
export * from './INewAccountTransaction';
export * from './INewBill';

export * as BankAccounts from './bank-accounts';
export * as BankFeeds from './bank-feeds';

export const createManager = (accountId: string, xeroAccessToken: AccessTokens.ITokenSet, tenantId: string, logger: ILogger): IManager => {
    const xeroClient = Xero.createClient(accountId, xeroAccessToken, tenantId, logger);
    return new Manager(xeroClient);
};
