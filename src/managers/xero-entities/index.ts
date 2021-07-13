import { Xero } from '@services';
import { ITokenSet } from '@shared';
import { ILogger } from '@utils';

import { IManager } from './IManager';
import { getBillExternalUrl, getCreditNoteExternalUrl, getExpenseNumber, getTransactionExternalUrl, getTransactionNumber, Manager } from './Manager';

export { IManager, Manager, getBillExternalUrl, getTransactionExternalUrl, getCreditNoteExternalUrl, getTransactionNumber, getExpenseNumber };
export * from './IAccountCode';
export * from './INewAccountTransaction';
export * from './ILineItem';
export * from './INewBill';
export * from './INewCreditNote';
export * from './IPaymentData';
export * from './IOrganisation';

export * as BankAccounts from './bank-accounts';
export * as BankFeeds from './bank-feeds';

export const createManager = (accountId: string, xeroAccessToken: ITokenSet, tenantId: string, logger: ILogger): IManager => {
    const xeroClient = Xero.createClient(accountId, xeroAccessToken, tenantId, logger);
    return new Manager(xeroClient, logger);
};
