import { Account } from 'xero-node';

import { Xero } from '@services';

import { IBankAccount } from './IBankAccount';
import { defBankAccountCode, defBankAccountName, defBankAccountNumber, IManager, mapAccountCodeToCurrency } from './IManager';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }

    async get(): Promise<IBankAccount[]> {
        return await this.xeroClient.getBankAccounts();
    }

    async getById(bankAccountId: string): Promise<IBankAccount | undefined> {
        return await this.xeroClient.getBankAccountById(bankAccountId);
    }

    async getByCurrency(currency: string): Promise<IBankAccount | undefined> {
        const bankAccountCode = defBankAccountCode(currency);
        const bankAccount = await this.xeroClient.getBankAccountByCode(bankAccountCode);
        return bankAccount;
    }

    async getOrCreateByCurrency(currency: string): Promise<IBankAccount> {
        const bankAccountCode = defBankAccountCode(currency);
        const bankAccountNumber = defBankAccountNumber(currency);
        const bankAccountName = defBankAccountName(currency);
        let bankAccount = await this.xeroClient.getBankAccountByCode(bankAccountCode);
        if (bankAccount) {
            if (bankAccount.status === Account.StatusEnum.ARCHIVED) {
                bankAccount = await this.xeroClient.activateBankAccount(bankAccount.accountID);
            }
        } else {
            bankAccount = await this.xeroClient.createBankAccount(bankAccountName, bankAccountCode, bankAccountNumber, currency);
        }

        return bankAccount;
    }

    getCurrencyByBankAccountCode(bankAccountCode: string): string {
        return mapAccountCodeToCurrency(bankAccountCode);
    }
}
