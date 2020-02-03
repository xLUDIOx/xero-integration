import { Payhawk } from '../../services';
import { IAccountCode } from './IAccountCode';
import { IBankAccount } from './IBankAccount';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { IOrganisation } from './IOrganisation';

export interface IManager {
    getOrganisation(): Promise<IOrganisation | undefined>;
    getContactIdForSupplier(supplier: Pick<Payhawk.ISupplier, 'name' | 'vat'>): Promise<string>;
    getBankAccounts(): Promise<IBankAccount[]>;
    getExpenseAccounts(): Promise<IAccountCode[]>;
    getBankAccountById(bankAccountId: string): Promise<IBankAccount | undefined>;
    getBankAccountIdForCurrency(currency: string): Promise<string>;
    createOrUpdateAccountTransaction(input: INewAccountTransaction): Promise<string>;
    createOrUpdateBill(input: INewBill): Promise<string>;
}
