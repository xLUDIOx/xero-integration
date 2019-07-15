import { Payhawk } from '../../services';
import * as XeroEntities from '../xero-entities';
import { INewAccountTransaction, INewBill } from '../xero-entities';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly payhawkClient: Payhawk.IClient,
        private readonly xeroEntities: XeroEntities.IManager) { }

    async synchronizeChartOfAccounts(): Promise<void> {
        const xeroAccountCodes = await this.xeroEntities.getExpenseAccounts();
        await this.payhawkClient.synchronizeChartOfAccounts(xeroAccountCodes.map(a => ({
            code: a.Code,
            name: a.Name,
        })));
    }

    async exportExpense(expenseId: string): Promise<void> {
        const expense = await this.payhawkClient.getExpense(expenseId);

        if (expense.transactions.length > 0) {
            await this.exportExpenseAsTransaction(expense);
        } else {
            await this.exportExpenseAsBill(expense);
        }
    }

    private async exportExpenseAsTransaction(expense: Payhawk.IExpense) {
        const currency = expense.transactions[0].cardCurrency;
        const bankAccountId = await this.xeroEntities.getBankAccountIdForCurrency(currency);
        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const totalAmount = expense.transactions.reduce((a, b) => a + b.cardAmount, 0);
        const newAccountTransaction: INewAccountTransaction = {
            bankAccountId,
            contactId,
            description: expense.note,
            reference: expense.transactions[0].description,
            totalAmount,
            accountCode: expense.reconciliation.accountCode,
        };

        await this.xeroEntities.createAccountTransaction(newAccountTransaction);
    }

    private async exportExpenseAsBill(expense: Payhawk.IExpense) {
        const currency = expense.reconciliation.expenseCurrency;
        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const totalAmount = expense.reconciliation.expenseTotalAmount;
        const newBill: INewBill = {
            contactId,
            description: expense.note,
            currency,
            totalAmount,
            accountCode: expense.reconciliation.accountCode,
        };

        await this.xeroEntities.createBill(newBill);
    }
}
