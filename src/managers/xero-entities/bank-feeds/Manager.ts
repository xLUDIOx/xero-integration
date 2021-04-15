import { CurrencyCode } from 'xero-node';

import { Xero } from '@services';
import { BankFeedAccountType, CreditDebitIndicator } from '@shared';
import { formatDate, ILogger } from '@utils';

import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(private readonly xeroClient: Xero.IClient, private readonly logger: ILogger) { }

    async getConnectionIdForBankAccount(bankAccount: Xero.IBankAccount): Promise<string> {
        const connection = await this.xeroClient.bankFeeds.getOrCreateBankFeedConnection({
            accountName: bankAccount.name,
            accountNumber: bankAccount.bankAccountNumber,
            currency: bankAccount.currencyCode as any,
            accountToken: BANK_FEED_TOKEN_MAP.get(bankAccount.currencyCode)!,
            accountType: BankFeedAccountType.Bank,
        });

        return connection.id;
    }

    async closeBankFeedConnection(connectionId: string): Promise<void> {
        await this.xeroClient.bankFeeds.closeBankFeedConnection(connectionId);
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

    async revertBankStatement(bankStatementId: string, bankTransactionId: string, date: string, contactName: string, description: string): Promise<string> {
        const logger = this.logger.child({
            revertBankStatement: {
                bankStatementId,
                bankTransactionId,
                date,
                contactName, description,
            },
        });

        const statement = await this.xeroClient.bankFeeds.getStatementById(bankStatementId);
        if (!statement) {
            throw logger.error(Error('Cannot revert original bank statement, it was not found'));
        }

        const revertedAmount = Number(statement.startBalance.amount) - (statement.endBalance.amount);

        const result = await this.createBankStatement(
            statement.feedConnectionId,
            bankTransactionId,
            date,
            revertedAmount,
            contactName,
            description,
        );

        return result;
    }
}

// no specific requirement for the token value
// apart from uniqueness
const BANK_FEED_TOKEN_MAP = new Map<CurrencyCode, string>()
    .set(CurrencyCode.EUR, '10000001')
    .set(CurrencyCode.USD, '10000002')
    .set(CurrencyCode.GBP, '10000003')
    .set(CurrencyCode.BGN, '10000004');
