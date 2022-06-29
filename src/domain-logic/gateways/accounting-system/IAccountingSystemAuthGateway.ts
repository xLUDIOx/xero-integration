import { IResult } from '@utils';

export interface IAccountingSystemAuthGateway {
    interpretCallbackParams(params: any): IAuthenticationCallbackParams;
    generateAuthorizationUrl(payhawkAccountId: string, payhawkReturnUrl: string): Promise<string>;
    exchangeCodeForAccessToken(payhawkAccountId: string, accountingSystemAccountId: string, code: string): Promise<any>;
    isAccessTokenExpired(accessTokenData: any): boolean;
    refreshAccessToken(accountingSystemAccountId: string, accessTokenData: any): Promise<any>;
    revokeAccessToken(accountingSystemAccountId: string, accessTokenData: any): Promise<IResult<void, TokenErrorCode>>;
}

export enum TokenErrorCode {
    TokenInvalid = 'token-invalid'
}

export interface IAuthenticationCallbackParams {
    payhawkAccountId: string;
    payhawkReturnUrl: string;
    accountingSystemAccountId: string;
    verificationCode: string;
}

export type IAccountingSystemAuthGatewayFactory = () => IAccountingSystemAuthGateway;
