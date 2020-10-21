import { Account, CurrencyCode } from 'xero-node';

import { Xero } from '@services';
import { formatDate } from '@utils';

import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }

    async getOrCreateConnection(bankAccount: Xero.IBankAccount): Promise<string> {
        const connectionId = await this.xeroClient.getOrCreateConnection({
            accountId: bankAccount.accountID,
            currency: bankAccount.currencyCode as any,
            accountToken: BANK_FEED_TOKEN_MAP.get(bankAccount.currencyCode)!,
            accountType: Account.BankAccountTypeEnum.BANK,
        });

        return connectionId;
    }

    async createBankStatementLine(feedConnectionId: string, bankTransactionId: string, date: string, amount: number, contactName: string, description: string): Promise<string> {
        return this.xeroClient.createBankStatementLine({
            feedConnectionId,
            bankTransactionId,
            date: formatDate(date),
            amount,
            contactName,
            description,
        });
    }
}

// no specific requirement for the token value
// apart from uniqueness
const BANK_FEED_TOKEN_MAP = new Map<CurrencyCode, string>()
    .set(CurrencyCode.EUR, '10000001')
    .set(CurrencyCode.USD, '10000002')
    .set(CurrencyCode.GBP, '10000003')
    .set(CurrencyCode.BGN, '10000004');
