import { Payhawk, Xero } from '@services';
import { IAccountCode, ITaxRate, ITrackingCategory } from '@shared';

import { IManager as IBankAccountsManager } from './bank-accounts';
import { IManager as IBankFeedsManager } from './bank-feeds';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { INewCreditNote } from './INewCreditNote';
import { IOrganisation } from './IOrganisation';

export interface IManager {
    bankAccounts: IBankAccountsManager;
    bankFeeds: IBankFeedsManager;

    getOrganisation(): Promise<IOrganisation>;

    getContactForRecipient(recipient: Payhawk.IRecipient): Promise<string>;
    getExpenseAccounts(): Promise<IAccountCode[]>;
    getTaxRates(): Promise<ITaxRate[]>;
    getTrackingCategories(): Promise<ITrackingCategory[]>;

    createOrUpdateAccountTransaction(input: INewAccountTransaction): Promise<string>;
    getBankTransactionByUrl(url: string): Promise<Xero.IBankTransaction | undefined>;
    deleteAccountTransaction(transactionUrl: string): Promise<void>;

    getCreditNoteByNumber(creditNoteNumber: string): Promise<Xero.ICreditNote | undefined>;
    createOrUpdateCreditNote(input: INewCreditNote, organisation: IOrganisation): Promise<string>;
    deleteCreditNote(creditNoteNumber: string): Promise<void>;

    getBillByUrl(url: string): Promise<Xero.IInvoice | undefined>;
    createOrUpdateBill(input: INewBill, organisation: IOrganisation): Promise<string>;
    deleteBill(billUrl: string): Promise<void>;

    deletePayment(paymentId: string): Promise<void>;
    getBillPayment(paymentId: string): Promise<Xero.IPayment | undefined>;

    ensureDefaultExpenseAccountsExist(): Promise<IAccountCode[]>;
}
