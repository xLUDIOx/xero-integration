import { TokenSet } from 'openid-client';
import * as TypeMoq from 'typemoq';

import { Xero } from '../../services';
import { IStore, ITokenSet, IUserTokenSetRecord } from '../../store';
import { ILogger } from '../../utils';
import { Manager } from './Manager';

describe('xero-connection/Manager', () => {
    const accountId = 'account_id';
    let storeMock: TypeMoq.IMock<IStore>;
    let authMock: TypeMoq.IMock<Xero.IAuth>;
    let loggerMock: TypeMoq.IMock<ILogger>;
    let manager: Manager;

    beforeEach(() => {
        storeMock = TypeMoq.Mock.ofType<IStore>();
        authMock = TypeMoq.Mock.ofType<Xero.IAuth>();
        loggerMock = TypeMoq.Mock.ofType<ILogger>();

        manager = new Manager(storeMock.object, authMock.object, accountId, loggerMock.object);
    });

    afterEach(() => {
        storeMock.verifyAll();
        authMock.verifyAll();
        loggerMock.verifyAll();
    });

    describe('getAuthorizationUrl', () => {
        test('saves request token and return url', async () => {
            const url = 'https://login at xero';

            authMock
                .setup(a => a.getAuthUrl())
                .returns(async () => url);

            const result = await manager.getAuthorizationUrl();

            expect(result).toEqual(url);
        });
    });

    describe('getAccessToken', () => {
        test('retrieves access token from store', async () => {
            const accessToken = createAccessToken();

            storeMock
                .setup(s => s.getAccessToken(accountId))
                .returns(async () => ({account_id: 'acc_id', token_set: accessToken}) as IUserTokenSetRecord);

            const result = await manager.getAccessToken();

            expect(result).toEqual(accessToken);
        });

        test('does not return access token from store if it has expired', async () => {
            const accessToken = createAccessToken(true);

            storeMock
                .setup(s => s.getAccessToken(accountId))
                .returns(async () => ({account_id: 'acc_id', token_set: accessToken}) as IUserTokenSetRecord);

            const result = await manager.getAccessToken();

            expect(result).toEqual(undefined);
        });
    });

    describe('authenticate', () => {
        test('throws if called without verifier argument', async () => {
            try {
                await manager.authenticate('');
                fail();
            } catch (err) {
                expect(err).toBeDefined();
            }
        });

        test('returns token and saves it on success', async () => {
            const verifier = 'verifier';
            const accessToken = createAccessToken();

            authMock
                .setup(a => a.getAccessToken(verifier))
                .returns(async () => ({ tokenSet: accessToken, tenantId: '', xeroUserId: '' }));

            storeMock
                .setup(s => s.createAccessToken({ account_id: accountId, token_set: accessToken, tenant_id: '', user_id: ''}))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            const result = await manager.authenticate(verifier);

            expect(result).toBe(accessToken);
        });

        test('throws on unexpected auth error', async () => {
            const expectedError = new Error('unexpected');
            const verifier = 'verifier';

            authMock
                .setup(a => a.getAccessToken(verifier))
                .returns(() => Promise.reject(expectedError));

            try {
                await manager.authenticate(verifier);
                fail();
            } catch (err) {
                expect(err).toBe(expectedError);
            }
        });
    });
});

function createAccessToken(expired: boolean = false): ITokenSet {
    return new TokenSet({
        access_token: 'token',
        expires_at: Math.floor(Date.now() / 1000) + (expired ? -1 : 1) * 30 * 60,
    });
}
