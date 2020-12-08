import { CurrencyCode } from 'xero-node';

import { Xero } from '@services';
import { BankFeedAccountType, CreditDebitIndicator, IBankStatement } from '@shared';
import { formatDate } from '@utils';

import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient) { }
    getBankStatementById(statementId: string): Promise<IBankStatement | undefined> {
        throw new Error('Method not implemented.');
    }

    async getConnectionIdForBankAccount(bankAccount: Xero.IBankAccount): Promise<string> {
        const connection = await this.xeroClient.bankFeeds.getOrCreateBankFeedConnection({
            accountId: bankAccount.accountID,
            currency: bankAccount.currencyCode as any,
            accountToken: BANK_FEED_TOKEN_MAP.get(bankAccount.currencyCode)!,
            accountType: BankFeedAccountType.Bank,
        });

        return connection.id;
    }

    async createBankStatement(feedConnectionId: string, bankTransactionId: string, date: string, amount: number, contactName: string, description: string): Promise<string> {
        const formattedDate = formatDate(date);
        const result = await this.xeroClient.bankFeeds.createBankStatement({
            feedConnectionId,
            startBalance: {
                amount: amount < 0 ? -amount : 0,
                creditDebitIndicator: CreditDebitIndicator.Debit,
            },
            endBalance: {
                amount: amount < 0 ? 0 : amount,
                creditDebitIndicator: CreditDebitIndicator.Debit,
            },
            startDate: formattedDate,
            endDate: formattedDate,
            statementLines: [{
                amount,
                creditDebitIndicator: amount < 0 ? CreditDebitIndicator.Credit : CreditDebitIndicator.Debit,
                transactionId: bankTransactionId,
                postedDate: formattedDate,
                payeeName: contactName,
                description,
            }],
        });

        return result.id;
    }

    async closeBankFeedConnection(connectionId: string): Promise<void> {
        await this.xeroClient.bankFeeds.closeBankFeedConnection(connectionId);
    }
}

// no specific requirement for the token value
// apart from uniqueness
const BANK_FEED_TOKEN_MAP = new Map<CurrencyCode, string>()
    .set(CurrencyCode.EUR, '10000001')
    .set(CurrencyCode.USD, '10000002')
    .set(CurrencyCode.GBP, '10000003')
    .set(CurrencyCode.BGN, '10000004');
