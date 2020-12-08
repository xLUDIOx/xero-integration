import { CreditDebitIndicator } from './CreditDebitIndicator';

export interface INewBankStatement {
    feedConnectionId: string;
    startDate: string;
    endDate: string;
    startBalance: IBankStatementBalance;
    endBalance: IBankStatementBalance;

    statementLines: IBankStatementLine[];
}

export interface IBankStatement extends INewBankStatement {
    id: string;
}

export interface IBankStatementBalance {
    amount: number;
    creditDebitIndicator: CreditDebitIndicator;
}

export interface IBankStatementLine {
    postedDate: string;
    description: string;
    amount: number;
    creditDebitIndicator: CreditDebitIndicator;
    transactionId: string;
    payeeName: string;
}
