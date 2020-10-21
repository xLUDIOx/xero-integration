import { Xero } from '@services';

export interface IManager {
    getOrCreateConnection(bankAccount: Xero.IBankAccount): Promise<string>;
    createBankStatementLine(feedConnectionId: string, bankTransactionId: string, date: string, amount: number, contactName: string, description: string): Promise<string>;
}
