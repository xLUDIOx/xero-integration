import { FinancialAccount } from './FinancialAccount';

export class ChartOfAccounts {
    constructor(private readonly items: FinancialAccount[]) { }

    getItems(): FinancialAccount[] {
        return this.items.slice();
    }
}
