import { TokenSet } from 'openid-client';
import { AccessTokens, Accounts, ISchemaStore } from '@data-access';
import * as TypeMoq from 'typemoq';

import { Xero } from '@services';
import { ITokenSet, IUserTokenSetRecord } from '@shared';
import { ILogger } from '@utils';

import { isAccessTokenExpired, Manager } from './Manager';

describe('xero-connection/Manager', () => {
    const accountId = 'account_id';
    let accessTokensStoreMock: TypeMoq.IMock<AccessTokens.IStore>;
    let accountsStoreMock: TypeMoq.IMock<Accounts.IStore>;
    let authMock: TypeMoq.IMock<Xero.IAuth>;
    let loggerMock: TypeMoq.IMock<ILogger>;
    let manager: Manager;

    beforeEach(() => {
        accessTokensStoreMock = TypeMoq.Mock.ofType<AccessTokens.IStore>();
        accountsStoreMock = TypeMoq.Mock.ofType<Accounts.IStore>();
        authMock = TypeMoq.Mock.ofType<Xero.IAuth>();
        loggerMock = TypeMoq.Mock.ofType<ILogger>();

        manager = new Manager({ accessTokens: accessTokensStoreMock.object, accounts: accountsStoreMock.object } as ISchemaStore, authMock.object, accountId, loggerMock.object);
    });

    afterEach(() => {
        accessTokensStoreMock.verifyAll();
        accountsStoreMock.verifyAll();
        authMock.verifyAll();
        loggerMock.verifyAll();
    });

    describe('getAuthorizationUrl', () => {
        test('saves request token and return url', async () => {
            const url = 'https://login at xero';

            authMock
                .setup(a => a.getAuthUrl())
                .returns(() => url);

            const result = manager.getAuthorizationUrl();

            expect(result).toEqual(url);
        });
    });

    describe('getAccessToken', () => {
        test('retrieves access token from store', async () => {
            const accessToken = createAccessToken();

            accessTokensStoreMock
                .setup(s => s.getByAccountId(accountId))
                .returns(async () => ({ account_id: 'acc_id', token_set: accessToken }) as IUserTokenSetRecord);

            const result = await manager.getAccessToken();

            expect(result).toEqual(accessToken);
        });

        test('does not return access token from store if it has expired', async () => {
            const accessToken = createAccessToken(true);

            accessTokensStoreMock
                .setup(s => s.getByAccountId(accountId))
                .returns(async () => ({ account_id: 'acc_id', token_set: accessToken }) as IUserTokenSetRecord);

            const result = await manager.getAccessToken();

            expect(result).toEqual(undefined);
        });
    });

    describe('authenticate', () => {
        test('returns token and saves it on success', async () => {
            const verifier = 'verifier';
            const accessToken = createAccessToken();

            authMock
                .setup(a => a.getAccessTokenFromCode(verifier))
                .returns(async () => (accessToken));

            const result = await manager.authenticate(verifier);

            expect(result).toBe(accessToken);
        });

        test('throws on unexpected auth error', async () => {
            const expectedError = new Error('unexpected');
            const verifier = 'verifier';

            authMock
                .setup(a => a.getAccessTokenFromCode(verifier))
                .returns(() => Promise.reject(expectedError));

            try {
                await manager.authenticate(verifier);
                fail();
            } catch (err) {
                expect(err).toBe(expectedError);
            }
        });
    });

    describe('isAccessTokenExpired', () => {
        it('should return true if token expired a minute ago', () => {
            const token = createAccessTokenWithExpiration(-60);
            expect(isAccessTokenExpired(token)).toEqual(true);
        });

        it('should return true if token expires in 45 sec', () => {
            const token = createAccessTokenWithExpiration(45);
            expect(isAccessTokenExpired(token)).toEqual(true);
        });

        it('should return false if token expires in 2 mins', () => {
            const token = createAccessTokenWithExpiration(120);
            expect(isAccessTokenExpired(token)).toEqual(false);
        });

        it('should return true if token expires_at is NaN', () => {
            const token = createAccessTokenWithExpiration(NaN);
            expect(isAccessTokenExpired(token)).toEqual(true);
        });

        it('should return true if token expires_at is undefined', () => {
            const token = createAccessTokenWithExpiration(undefined);
            expect(isAccessTokenExpired(token)).toEqual(true);
        });
    });
});

function createAccessToken(expired: boolean = false): ITokenSet {
    return new TokenSet({
        access_token: 'token',
        expires_at: Math.floor(Date.now() / 1000) + (expired ? -1 : 1) * 30 * 60,
    });
}

function createAccessTokenWithExpiration(seconds: number | typeof NaN | undefined): ITokenSet {
    return new TokenSet({
        access_token: 'token',
        expires_at: seconds === undefined ? undefined :
            Number.isNaN(seconds) ? NaN :
                Math.floor(Date.now() / 1000) + seconds,
    });
}
