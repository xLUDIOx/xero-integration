import { Payhawk } from '../../services';
import { IAccountCode } from './IAccountCode';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';

export interface IManager {
    getContactIdForSupplier(supplier: Pick<Payhawk.ISupplier, 'name' | 'vat'>): Promise<string>;
    getExpenseAccounts(): Promise<IAccountCode[]>;
    getBankAccountIdForCurrency(currency: string): Promise<string>;
    createOrUpdateAccountTransaction(input: INewAccountTransaction): Promise<void>;
    createOrUpdateBill(input: INewBill): Promise<void>;
}
