import { XeroClient } from 'xero-node';

import { AccessTokens } from '@stores';
import { createDocumentSanitizer, createLock, ILogger } from '@utils';

import { Auth, IAccessToken, IAuth } from './auth';
import {
    AccountType,
    BankAccountStatusCode,
    Client,
    IAccountCode,
    IAccountingItemData,
    IAttachment,
    IBankAccount,
    IBankTransaction,
    IBillPaymentData,
    IClient,
    ICreateBillData,
    ICreateTransactionData,
    IInvoice,
    InvoiceStatus,
    IOrganisation,
    IPayment,
    ITenant,
    IUpdateBillData,
    IUpdateTransactionData,
} from './client';
import { getXeroConfig } from './Config';
import { createXeroHttpClient } from './http';

export {
    AccountType,
    BankAccountStatusCode,
    IAccountCode,
    IAccountingItemData,
    IAttachment,
    IAuth,
    IAccessToken,
    IBankAccount,
    IClient,
    ICreateBillData,
    IUpdateBillData,
    ICreateTransactionData,
    IUpdateTransactionData,
    IBillPaymentData,
    IOrganisation,
    IInvoice,
    InvoiceStatus,
    IBankTransaction,
    IPayment,
    ITenant,
};

export const createAuth = ({ accountId, returnUrl }: IAuthParams, logger: ILogger): IAuth => {
    return new Auth(accountId, returnUrl, logger);
};

export const createClient = (accountId: string, accessToken: AccessTokens.ITokenSet, tenantId: string, logger: ILogger): IClient => {
    const originalClient = new XeroClient(getXeroConfig(accountId));
    originalClient.setTokenSet(accessToken);

    return new Client(createXeroHttpClient(originalClient, createLock(), logger), tenantId, createDocumentSanitizer(), logger);
};

export interface IAuthParams {
    accountId: string;
    returnUrl?: string;
}
