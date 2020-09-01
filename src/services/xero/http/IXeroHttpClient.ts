import { IncomingMessage } from 'http';

import { Response } from 'request';
import { ValidationError, XeroClient } from 'xero-node';

/**
 * An interface for a Xero client wrapper that enables making Xero API calls
 */
export interface IXeroHttpClient {
    /**
     * Makes a request using a Xero client instance, with error handling
     * @param action A function that accepts as parameter a Xero client instance and returns a promise
     * @param responseType The entity type that should be returned from the client action
     */
    makeClientRequest<TResult extends any>(action: (client: XeroClient) => Promise<any>, responseType?: EntityResponseType): Promise<TResult>;

    /**
     * Makes a raw request against the Xero API on the provided path, with error handling
     * @param method The HTTP method of the request
     * @param path The path to make request on
     * @param tenantId The Xero tenant ID
     * @param responseType The entity type that should be returned from the client action
     */
    makeRawRequest<TResult extends any>(method: string, path: string, tenantId: string, responseType?: EntityResponseType): Promise<TResult>;
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
