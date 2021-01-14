import { Currency } from './Currency';

export interface INewBankFeedConnection {
    /**
     * Associated bank account id
     */
    accountId: string;

    /**
     * Unique bank account token
     */
    accountToken: string;

    /**
     * Bank account type
     */
    accountType: BankFeedAccountType;

    /**
     * Bank account and feed connection currency
     */
    currency: Currency;
}

export interface IBankFeedConnection extends INewBankFeedConnection {
    /**
     * Feed connection id
     */
    id: string;

    /**
     * Current bank feed connection status. Will be undefined if the connection is active
     */
    status?: BankFeedConnectionStatus;

    /**
     * Error info in case status is REJECTED
     */
    error?: any;
}

export enum BankFeedAccountType {
    Bank = 'BANK',
}

export enum BankFeedConnectionStatus {
    Pending = 'PENDING',
    Rejected = 'REJECTED',
}

export interface IFeedConnectionError {
    status: number;
    title: string;
    type: BankFeedConnectionErrorType;
    detail: string;
}

export enum BankFeedConnectionErrorType {
    InvalidOrganisationBankFeeds = 'invalid-organisation-bank-feeds',
    InvalidOrganisationMultiCurrency = 'invalid-organisation-multi-currency',
    InternalError = 'internal-error',
}
