import { XeroClient } from 'xero-node';

import { ITokenSet } from '../../store';
import { createDocumentSanitizer, ILogger } from '../../utils';
import { Auth, IAccessToken, IAuth } from './auth';
import {
    AccountType,
    BankAccountStatusCode,
    Client,
    IAccountCode,
    IAccountingItemData,
    IAttachment,
    IBankAccount,
    IBillPaymentData,
    IClient,
    ICreateBillData,
    ICreateTransactionData,
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
};

export const createAuth = ({ accountId, returnUrl }: IAuthParams, logger: ILogger): IAuth => {
    return new Auth(accountId, returnUrl, logger);
};

export const createClient = (accountId: string, accessToken: ITokenSet, tenantId: string, logger: ILogger): IClient => {
    const originalClient = new XeroClient(getXeroConfig(accountId));
    originalClient.setTokenSet(accessToken);

    return new Client(createXeroHttpClient(originalClient, logger), tenantId, createDocumentSanitizer(), logger);
};

export interface IAuthParams {
    accountId: string;
    returnUrl?: string;
}
