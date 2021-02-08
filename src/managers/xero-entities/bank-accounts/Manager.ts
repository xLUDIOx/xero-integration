import { Account } from 'xero-node';

import { Xero } from '@services';

import { IBankAccount } from './IBankAccount';
import { defBankAccountCode, defBankAccountName, defBankAccountNumber, IManager, mapBankAccountCodeToCurrency } from './IManager';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }

    async get(): Promise<IBankAccount[]> {
        return await this.xeroClient.getBankAccounts();
    }

    async getById(bankAccountId: string): Promise<IBankAccount | undefined> {
        return await this.xeroClient.getBankAccountById(bankAccountId);
    }

    async getOrCreateByCurrency(currency: string): Promise<IBankAccount> {
        const bankAccountCode = defBankAccountCode(currency);
        const bankAccountNumber = defBankAccountNumber(currency);
        const bankAccountName = defBankAccountName(currency);
        let bankAccount = await this.xeroClient.getBankAccountByCodeOrName(bankAccountCode, bankAccountName);
        if (bankAccount && bankAccount.status === Account.StatusEnum.ARCHIVED) {
            throw Error(`${bankAccountName} bank account is archived and cannot be used`);
        }

        if (!bankAccount) {
            bankAccount = await this.xeroClient.createBankAccount(bankAccountName, bankAccountCode, bankAccountNumber, currency);
        }

        return bankAccount;
    }

    getCurrencyByBankAccountCode(bankAccountCode: string): string {
        return mapBankAccountCodeToCurrency(bankAccountCode);
    }
}
