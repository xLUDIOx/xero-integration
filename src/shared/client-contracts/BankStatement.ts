import { CreditDebitIndicator } from './CreditDebitIndicator';

export interface INewBankStatement {
    feedConnectionId: string;
    startDate: string;
    endDate: string;
    startBalance: IBankStatementBalance;
    endBalance: IBankStatementBalance;

    statementLines?: IBankStatementLine[];
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

export interface IRejectedBankStatement {
    id: string;
    feedConnectionId: string;
    status: BankStatementStatus.Rejected,
    errors: IBankStatementError[];
}

export interface IBankStatementError {
    status: number;
    title: string;
    type: BankStatementErrorType;
    detail: string;
}

export enum BankStatementStatus {
    Pending = 'PENDING',
    Rejected = 'REJECTED',
    Delivered = 'DELIVERED',
}

export enum BankStatementErrorType {
    InvalidStartDate = 'invalid-start-date',
    InvalidEndDate = 'invalid-end-date',
    InvalidFeedConnection = 'invalid-feed-connection',
    InternalError = 'internal-error',
    DuplicateStatement = 'duplicate-statement',
}
