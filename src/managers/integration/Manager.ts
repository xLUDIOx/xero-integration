import { Payhawk, Xero } from '../../services';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly xeroClient: Xero.IClient,
        private readonly payhawkClient: Payhawk.IClient) { }

    async synchronizeChartOfAccounts(): Promise<void> {
        const xeroAccountCodes = await this.xeroClient.getExpenseAccounts();
        await this.payhawkClient.synchronizeChartOfAccounts(xeroAccountCodes);
    }

    async exportExpense(expenseId: string): Promise<void> {
        await this.xeroClient.createTransaction();
    }
}
