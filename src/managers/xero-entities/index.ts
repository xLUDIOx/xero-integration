import { Xero } from '../../services';
import { ITokenSet } from '../../store';
import { ILogger } from '../../utils';
import { IManager } from './IManager';
import { getBillExternalUrl, getTransactionExternalUrl, Manager } from './Manager';

export { IManager, getBillExternalUrl, getTransactionExternalUrl };
export * from './IAccountCode';
export * from './INewAccountTransaction';
export * from './INewBill';

export const createManager = (accountId: string, xeroAccessToken: ITokenSet, tenantId: string, logger: ILogger): IManager => {
    const xeroClient = Xero.createClient(accountId, xeroAccessToken, tenantId, logger);
    return new Manager(xeroClient);
};
