import { Payhawk, Xero } from '../../services';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly xeroClient: Xero.IClient,
        private readonly payhawkClient: Payhawk.IClient) { }

    async synchronizeChartOfAccounts(): Promise<void> {
        const xeroAccountCodes = await this.xeroClient.getExpenseAccounts();
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
        const bankAccountCode = defBankAccountCode(currency);
        const bankAccountNumber = defBankAccountNumber(currency);
        const bankAccountName = defBankAccountName(currency);
        const contactName = expense.supplier.name || 'Payhawk Transaction';
        let bankAccount = await this.xeroClient.getBankAccountByCode(bankAccountCode) || await this.xeroClient.createBankAccount(bankAccountName, bankAccountCode, bankAccountNumber, currency);
        if (bankAccount.Status === 'ARCHIVED') {
            bankAccount = await this.xeroClient.activateBankAccount(bankAccount);
        }

        const contact = await this.xeroClient.findContact(contactName, expense.supplier.vat) ||
            await this.xeroClient.createContact(contactName, expense.supplier.name ? expense.supplier.vat : undefined);

        const total = expense.transactions.reduce((a, b) => a + b.cardAmount, 0);
        await this.xeroClient.createTransaction(bankAccount.AccountID!, contact.ContactID!, expense.note || '(no note)', expense.transactions[0].description, total, expense.reconciliation.accountCode);
    }

    private async exportExpenseAsBill(expense: Payhawk.IExpense) {
        const currency = expense.reconciliation.expenseCurrency;
        const contactName = expense.supplier.name || 'Payhawk Transaction';
        const contact = await this.xeroClient.findContact(contactName, expense.supplier.vat) ||
            await this.xeroClient.createContact(contactName, expense.supplier.name ? expense.supplier.vat : undefined);

        const total = expense.reconciliation.expenseTotalAmount;
        await this.xeroClient.createBill(contact.ContactID!, expense.note || '(no note)', currency, total, expense.reconciliation.accountCode);
    }
}

const defBankAccountNumber = (currency: string) => `PAYHAWK-${currency}`;
const defBankAccountCode = (currency: string) => `PHWK-${currency}`;
const defBankAccountName = (currency: string) => `Payhawk ${currency}`;
