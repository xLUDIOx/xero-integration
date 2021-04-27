import { Payhawk, Xero } from '@services';
import { IAccountCode, ITaxRate, ITrackingCategory } from '@shared';

import { IManager as IBankAccountsManager } from './bank-accounts';
import { IManager as IBankFeedsManager } from './bank-feeds';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { IOrganisation } from './IOrganisation';

export interface IManager {
    bankAccounts: IBankAccountsManager;
    bankFeeds: IBankFeedsManager;

    getOrganisation(): Promise<IOrganisation>;
    getContactForRecipient(recipient: Pick<Payhawk.IRecipient, 'name' | 'vat' | 'email'>): Promise<string>;
    getExpenseAccounts(): Promise<IAccountCode[]>;
    getTaxRates(): Promise<ITaxRate[]>;
    getTrackingCategories(): Promise<ITrackingCategory[]>;
    createOrUpdateAccountTransaction(input: INewAccountTransaction): Promise<string>;
    getBankTransactionByUrl(url: string): Promise<Xero.IBankTransaction | undefined>;
    deleteAccountTransaction(transactionUrl: string): Promise<void>;
    createOrUpdateBill(input: INewBill): Promise<string>;
    getBillByUrl(url: string): Promise<Xero.IInvoice | undefined>;
    deleteBill(billUrl: string): Promise<void>;
    deleteBillPayment(paymentId: string): Promise<void>;
    getBillPayment(paymentId: string): Promise<Xero.IPayment | undefined>;

    ensureDefaultExpenseAccountsExist(): Promise<IAccountCode[]>;
}
