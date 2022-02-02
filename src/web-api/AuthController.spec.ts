import { TokenSet } from 'openid-client';
import * as restify from 'restify';
import * as TypeMoq from 'typemoq';

import { XeroConnection } from '@managers';
import { ITokenSet } from '@shared';
import { ForbiddenError, ILogger } from '@utils';

import { IConfig } from '../Config';
import { AuthController } from './AuthController';
import { ConnectionMessage } from './IConnectionStatus';

describe('AuthController', () => {
    const accountId = 'accountId';
    let connectionManagerMock: TypeMoq.IMock<XeroConnection.IManager>;
    let configMock: TypeMoq.IMock<IConfig>;
    let responseMock: TypeMoq.IMock<restify.Response>;
    let nextMock: TypeMoq.IMock<restify.Next>;
    let loggerMock: TypeMoq.IMock<ILogger>;

    let controller: AuthController;

    beforeEach(() => {
        connectionManagerMock = TypeMoq.Mock.ofType<XeroConnection.IManager>();
        configMock = TypeMoq.Mock.ofType<IConfig>();
        responseMock = TypeMoq.Mock.ofType<restify.Response>();
        nextMock = TypeMoq.Mock.ofType<restify.Next>();

        loggerMock = TypeMoq.Mock.ofType<ILogger>();
        loggerMock.setup(l => l.child(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => loggerMock.object);

        configMock.setup(c => c.portalUrl).returns(() => 'http://localhost');

        connectionManagerMock.setup(m => m.authenticate);

        controller = new AuthController(
            () => connectionManagerMock.object,
            configMock.object,
            loggerMock.object,
        );
    });

    afterEach(() => {
        connectionManagerMock.verifyAll();
        responseMock.verifyAll();
        nextMock.verifyAll();
        loggerMock.verifyAll();
    });

    describe('connect()', () => {
        test('sends status 400 when missing accountId query parameter', async () => {
            const req = { query: {} } as restify.Request;

            await expect(controller.connect(req, responseMock.object, nextMock.object))
                .rejects
                .toThrowError('Missing required query parameter: accountId.');
        });

        test('throw error when the manager throws error', async () => {
            connectionManagerMock.setup(m => m.getAuthorizationUrl()).throws(Error());

            const req = { query: { accountId } } as restify.Request;
            await expect(controller.connect(req, responseMock.object, nextMock.object)).rejects.toThrow();
        });

        test('redirects to authorization URL', async () => {
            const authorizationUrl = 'expected authorization url';
            connectionManagerMock.setup(m => m.getAuthorizationUrl()).returns(() => authorizationUrl);
            responseMock.setup(r => r.redirect(authorizationUrl, nextMock.object)).verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });
    });

    describe('callback()', () => {
        test('sends status 400 when missing state query parameter', async () => {
            const req = { query: { code: '' } } as restify.Request;

            await expect(controller.callback(req, responseMock.object, nextMock.object))
                .rejects
                .toThrowError('Missing required query parameter: state.');
        });

        test('throw error when the manager throws error', async () => {
            const req = {
                url: '/callback?code=YWNjb3VudElkPXBlc2hvXzEyMyZyZXR1cm5Vcmw9L215LXBhdGg=',
                query: { code: 'code', state: 'YWNjb3VudElkPXBlc2hvXzEyMyZyZXR1cm5Vcmw9L215LXBhdGg=' },
            } as restify.Request;

            connectionManagerMock.setup(m => m.authenticate(req.query.code)).returns(() => Promise.reject(new Error()));

            await expect(controller.callback(req, responseMock.object, nextMock.object)).rejects.toThrow();
        });

        test('redirects to return url', async () => {
            const token = createAccessToken();

            const returnUrl = '/my-path';
            responseMock
                .setup(r => r.redirect(`http://localhost${returnUrl}?connection=xero`, nextMock.object))
                .verifiable(TypeMoq.Times.once());

            const req = {
                url: '',
                query: { code: 'code', state: 'YWNjb3VudElkPXBlc2hvXzEyMyZyZXR1cm5Vcmw9L215LXBhdGg=' },
            } as restify.Request;

            connectionManagerMock
                .setup(m => m.getAuthorizedTenants(token))
                .returns(async () => [{ tenantId: '1' } as any])
                .verifiable(TypeMoq.Times.once());

            connectionManagerMock.setup(m => m.authenticate(req.query.code)).returns(async () => (token));

            await controller.callback(req, responseMock.object, nextMock.object);
        });
    });

    describe('getConnectionStatus()', () => {
        test('returns true if token is valid and request succeeds', async () => {
            const organisationName = 'Demo GmbH';

            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

            const accessToken = createAccessToken();

            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            connectionManagerMock
                .setup(m => m.getAuthorizedTenants(accessToken))
                .returns(() => Promise.resolve([{ tenantId: '1', tenantName: organisationName } as any]))
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(200, { isAlive: true, title: organisationName }))
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.getConnectionStatus(req, responseMock.object);
        });

        test('returns false if token is invalid', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => undefined);

            responseMock
                .setup(r => r.send(200, { isAlive: false }))
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.getConnectionStatus(req, responseMock.object);
        });

        test('returns disconnected remotely if request fails', async () => {
            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

            const accessToken = createAccessToken();

            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            connectionManagerMock
                .setup(m => m.getAuthorizedTenants(accessToken))
                .throws(new ForbiddenError())
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(200, { isAlive: false, message: ConnectionMessage.DisconnectedRemotely }))
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.getConnectionStatus(req, responseMock.object);
        });

        test('returns token expired', async () => {
            const token = createAccessToken(true);
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => token);

            responseMock
                .setup(r => r.send(200, { isAlive: false, message: ConnectionMessage.TokenExpired }))
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.getConnectionStatus(req, responseMock.object);
        });

        test('logs unexpected error and return isAlive: false', async () => {
            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

            const accessToken = createAccessToken();

            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            const error = new Error('Oops, something broke...');
            connectionManagerMock
                .setup(m => m.getAuthorizedTenants(accessToken))
                .throws(error)
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;

            responseMock
                .setup(r => r.send(200, { isAlive: false }))
                .verifiable(TypeMoq.Times.once());

            await controller.getConnectionStatus(req, responseMock.object);
        });
    });
});

function createAccessToken(expired: boolean = false): ITokenSet {
    return new TokenSet({
        access_token: 'token',
        expires_at: Math.floor(Date.now() / 1000) + (expired ? -1 : 1) * 30 * 60,
    });
}
