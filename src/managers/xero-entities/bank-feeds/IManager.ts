import { Xero } from '@services';

export interface IManager {
    getConnectionIdForBankAccount(bankAccount: Xero.IBankAccount): Promise<string>;
    closeBankFeedConnection(connectionId: string): Promise<void>;

    createBankStatement(feedConnectionId: string, bankTransactionId: string, date: string, amount: number, contactName: string, description: string): Promise<string>
}
