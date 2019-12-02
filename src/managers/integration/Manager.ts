import { Payhawk } from '../../services';
import * as XeroEntities from '../xero-entities';
import { INewAccountTransaction, INewBill } from '../xero-entities';
import { IManager } from './IManager';

export class Manager implements IManager {
    constructor(
        private readonly payhawkClient: Payhawk.IClient,
        private readonly xeroEntities: XeroEntities.IManager,
        private readonly deleteFile: (filePath: string) => Promise<void>,
        private readonly accountId: string,
        private readonly portalUrl: string) { }

    async getOrganisationName(): Promise<string | undefined> {
        return await this.xeroEntities.getOrganisationName();
    }

    async synchronizeChartOfAccounts(): Promise<void> {
        const xeroAccountCodes = await this.xeroEntities.getExpenseAccounts();
        await this.payhawkClient.synchronizeChartOfAccounts(xeroAccountCodes.map(a => ({
            code: a.Code,
            name: a.Name,
        })));
    }

    async exportExpense(expenseId: string): Promise<void> {
        const expense = await this.payhawkClient.getExpense(expenseId);
        const files = await this.payhawkClient.downloadFiles(expense);

        try {
            if (expense.transactions.length > 0) {
                await this.exportExpenseAsTransaction(expense, files);
            } else {
                await this.exportExpenseAsBill(expense, files);
            }
        } finally {
            await Promise.all(files.map(async (f: Payhawk.IDownloadedFile) => this.deleteFile(f.path)));
        }
    }

    async exportTransfers(startDate: string, endDate: string): Promise<void> {
        const transfers = await this.payhawkClient.getTransfers(startDate, endDate);
        if (!transfers.length) {
            return;
        }

        const contactId = await this.xeroEntities.getContactIdForSupplier({ name: 'New Deposit' });

        const bankAccountIdMap = new Map<string, string>();

        for (const transfer of transfers) {
            let bankAccountId = bankAccountIdMap.get(transfer.currency);
            if (!bankAccountId) {
                bankAccountId = await this.xeroEntities.getBankAccountIdForCurrency(transfer.currency);
                bankAccountIdMap.set(transfer.currency, bankAccountId);
            }

            await this.exportTransferAsTransaction(transfer, contactId, bankAccountId);
        }
    }

    private async exportExpenseAsTransaction(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[]) {
        // common data for all transactions linked to the expense
        const currency = expense.transactions[0].cardCurrency;
        const bankAccountId = await this.xeroEntities.getBankAccountIdForCurrency(currency);
        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        for (const t of expense.transactions) {
            const totalAmount = t.cardAmount;
            const newAccountTransaction: INewAccountTransaction = {
                date: t.settlementDate,
                bankAccountId,
                contactId,
                description: expense.note,
                reference: t.description,
                totalAmount,
                accountCode: expense.reconciliation.accountCode,
                files,
                url: this.transactionUrl(t.id),
            };

            await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);
        }
    }

    private async exportTransferAsTransaction(transfer: Payhawk.IBalanceTransfer, contactId: string, bankAccountId: string): Promise<void> {
        const newAccountTransaction: INewAccountTransaction = {
            date: transfer.date,
            bankAccountId,
            contactId,
            reference: `Bank wire received on ${new Date(transfer.date).toUTCString()}`,
            totalAmount: -Math.abs(transfer.amount),
            files: [],
            url: this.transferUrl(transfer.id),
        };

        await this.xeroEntities.createOrUpdateAccountTransaction(newAccountTransaction);
    }

    private async exportExpenseAsBill(expense: Payhawk.IExpense, files: Payhawk.IDownloadedFile[]) {
        const currency = expense.reconciliation.expenseCurrency;
        const contactId = await this.xeroEntities.getContactIdForSupplier(expense.supplier);

        const totalAmount = expense.reconciliation.expenseTotalAmount;
        const newBill: INewBill = {
            date: expense.document ? expense.document.date : expense.createdAt,
            dueDate: expense.paymentData.dueDate,
            contactId,
            description: expense.note,
            currency,
            totalAmount,
            accountCode: expense.reconciliation.accountCode,
            files,
            url: this.expenseUrl(expense.id),
        };

        await this.xeroEntities.createOrUpdateBill(newBill);
    }

    private expenseUrl(expenseId: string): string {
        return `${this.portalUrl}/expenses/${encodeURIComponent(expenseId)}?accountId=${encodeURIComponent(this.accountId)}`;
    }

    private transactionUrl(transactionId: string): string {
        return `${this.portalUrl}/expenses?transactionId=${encodeURIComponent(transactionId)}&accountId=${encodeURIComponent(this.accountId)}`;
    }

    private transferUrl(transferId: string): string {
        return `${this.portalUrl}/funds?transferId=${encodeURIComponent(transferId)}&accountId=${encodeURIComponent(this.accountId)}`;
    }
}
