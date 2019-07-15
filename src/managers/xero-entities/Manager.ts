import { Contact } from 'xero-node/lib/AccountingAPI-models';

import { Payhawk, Xero } from '../../services';
import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';

const DEFAULT_ACCOUNT_CODE = '429';
const DEFAULT_DESCRIPTION = '(no note)';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient, private readonly defaultContactName: string) { }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        return await this.xeroClient.getExpenseAccounts();
    }

    async getContactIdForSupplier(supplier: Payhawk.ISupplier): Promise<string> {
        const contactName = supplier.name || this.defaultContactName;
        const contact = await this.xeroClient.findContact(contactName, supplier.vat) ||
            await this.xeroClient.createContact(contactName, supplier.name ? supplier.vat : undefined);

        return contact.ContactID!;
    }

    async getBankAccountIdForCurrency(currency: string): Promise<string> {
        const bankAccountCode = defBankAccountCode(currency);
        const bankAccountNumber = defBankAccountNumber(currency);
        const bankAccountName = defBankAccountName(currency);
        let bankAccount = await this.xeroClient.getBankAccountByCode(bankAccountCode) || await this.xeroClient.createBankAccount(bankAccountName, bankAccountCode, bankAccountNumber, currency);
        if (bankAccount.Status === 'ARCHIVED') {
            bankAccount = await this.xeroClient.activateBankAccount(bankAccount);
        }

        return bankAccount.AccountID!;
    }

    async createAccountTransaction({
        bankAccountId,
        contactId,
        description,
        reference,
        totalAmount,
        accountCode,
    }: INewAccountTransaction): Promise<void> {
        await this.xeroClient.createTransaction(bankAccountId, contactId, description || DEFAULT_DESCRIPTION, reference, totalAmount, accountCode || DEFAULT_ACCOUNT_CODE);
    }

    async createBill({
        contactId,
        description,
        currency,
        totalAmount,
        accountCode,
    }: INewBill): Promise<void> {
        await this.xeroClient.createBill(contactId, description || DEFAULT_DESCRIPTION, currency, totalAmount, accountCode || DEFAULT_ACCOUNT_CODE);
    }
}

const defBankAccountNumber = (currency: string) => `PAYHAWK-${currency}`;
const defBankAccountCode = (currency: string) => `PHWK-${currency}`;
const defBankAccountName = (currency: string) => `Payhawk ${currency}`;
