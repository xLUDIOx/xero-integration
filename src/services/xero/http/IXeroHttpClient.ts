import { IncomingMessage } from 'http';

import { Response } from 'request';
import { ValidationError, XeroClient } from 'xero-node';

export interface IXeroHttpClient {
    makeSafeRequest<TResult extends any>(action: (client: XeroClient) => Promise<any>, responseType?: EntityResponseType): Promise<TResult>;
}

export interface IApiResponse<T = any> {
    response: IncomingMessage;
    body: T;
}

export interface IValidationErrorsItem {
    ValidationErrors?: ValidationError[];
}

export interface IErrorResponse extends Response {
    body: IErrorResponseBody;
}

interface IErrorResponseBody {
    ErrorNumber: number;
    Message: string;
    Type: ResponseErrorType;
    Elements: IValidationErrorsItem[];
}

export enum ResponseErrorType {
    Validation = 'ValidationException',
}

export enum EntityResponseType {
    Accounts = 'Accounts',
    Attachments = 'Attachments',
    BankTransactions = 'BankTransactions',
    Contacts = 'Contacts',
    Currencies = 'Currencies',
    Invoices = 'Invoices',
    Organisations = 'Organisations',
    Payments = 'Payments',
}
