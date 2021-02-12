import { Xero } from '@services';
import { ITokenSet } from '@shared';
import { ILogger } from '@utils';

import { IManager } from './IManager';
import { getBillExternalUrl, getTransactionExternalUrl, Manager } from './Manager';

export { IManager, getBillExternalUrl, getTransactionExternalUrl };
export * from './IAccountCode';
export * from './INewAccountTransaction';
export * from './INewBill';
export * from './IOrganisation';

export * as BankAccounts from './bank-accounts';
export * as BankFeeds from './bank-feeds';

export const createManager = (accountId: string, xeroAccessToken: ITokenSet, tenantId: string, logger: ILogger): IManager => {
    const xeroClient = Xero.createClient(accountId, xeroAccessToken, tenantId, logger);
    return new Manager(xeroClient, logger);
};
