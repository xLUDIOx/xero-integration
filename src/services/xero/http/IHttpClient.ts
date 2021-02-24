export interface IHttpClient {
    request<TBody = any>(requestOptions: IRequestOptions): Promise<TBody>;
}

export const AUTHORIZATION_HEADER = 'Authorization';
export const XERO_TENANT_ID_HEADER = 'Xero-Tenant-Id';
export const CONTENT_TYPE_HEADER = 'Content-Type';

export interface IRequestOptions {
    method: 'GET' | 'PUT' | 'POST' | 'DELETE';
    url?: string;
    authorization?: IAuthorizationOptions;
    data?: any;
    contentType?: string;
    responseType?: 'json' | 'arraybuffer' | 'stream';
    entityResponseType?: EntityResponseType | string;
}

type IAuthorizationOptions = {
    basic: IBasicAuthOptions,
    authToken?: never;
} | {
    basic?: never;
    authToken: string;
};

type IBasicAuthOptions = {
    user: string;
    secret: string;
};

export enum EntityResponseType {
    Accounts = 'Accounts',
    Attachments = 'Attachments',
    BankStatements = 'Statements',
    BankTransactions = 'BankTransactions',
    Contacts = 'Contacts',
    Currencies = 'Currencies',
    FeedConnections = 'FeedConnections',
    Invoices = 'Invoices',
    Items = 'Items',
    Organisations = 'Organisations',
    Payments = 'Payments',
    TaxRates = 'TaxRates',
}

export enum HttpStatusCodes {
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    TooManyRequests = 429,
    InternalError = 500,
    Timeout = 504,
}
