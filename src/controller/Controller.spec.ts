import * as restify from 'restify';
import * as TypeMoq from 'typemoq';

import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';
import { IConfig } from '../Config';
import { Integration, XeroConnection } from '../managers';
import { ILogger } from '../utils';
import { Controller } from './Controller';
import { PayhawkEvent } from './PayhawkEvent';

describe('Controller', () => {
    const accountId = 'accountId';
    let connectionManagerMock: TypeMoq.IMock<XeroConnection.IManager>;
    let integrationManagerMock: TypeMoq.IMock<Integration.IManager>;
    let configMock: TypeMoq.IMock<IConfig>;
    let responseMock: TypeMoq.IMock<restify.Response>;
    let nextMock: TypeMoq.IMock<restify.Next>;
    let loggerMock: TypeMoq.IMock<ILogger>;

    let controller: Controller;

    beforeEach(() => {
        connectionManagerMock = TypeMoq.Mock.ofType<XeroConnection.IManager>();
        integrationManagerMock = TypeMoq.Mock.ofType<Integration.IManager>();
        configMock = TypeMoq.Mock.ofType<IConfig>();
        responseMock = TypeMoq.Mock.ofType<restify.Response>();
        nextMock = TypeMoq.Mock.ofType<restify.Next>();

        loggerMock = TypeMoq.Mock.ofType<ILogger>();
        loggerMock.setup(l => l.child(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => loggerMock.object);

        configMock.setup(c => c.portalUrl).returns(() => 'http://localhost');

        connectionManagerMock.setup(m => m.authenticate);

        controller = new Controller(loggerMock.object,
            () => connectionManagerMock.object,
            () => integrationManagerMock.object,
            configMock.object);
    });

    afterEach(() => {
        connectionManagerMock.verifyAll();
        integrationManagerMock.verifyAll();
        responseMock.verifyAll();
        nextMock.verifyAll();
        loggerMock.verifyAll();
    });

    describe('connect()', () => {
        test('sends status 400 when missing accountId query parameter', async () => {
            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { query: {} } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });

        test('sends 500 when the manager throws error', async () => {
            responseMock.setup(r => r.send(500)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.getAuthorizationUrl()).returns(() => Promise.reject(new Error()));

            const req = { query: { accountId } } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });

        test('redirects to authorization URL', async () => {
            const authorizationUrl = 'expected authorization url';
            connectionManagerMock.setup(m => m.getAuthorizationUrl()).returns(async () => authorizationUrl);
            responseMock.setup(r => r.redirect(authorizationUrl, nextMock.object)).verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });
    });

    describe('callback()', () => {
        test('sends status 400 when missing accountId query parameter', async () => {
            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { query: {} } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends status 400 when missing oauth_verifier query parameter', async () => {
            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends status 400 when missing returnUrl query parameter', async () => {
            const verifier = 'verifier query param';
            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId, oauth_verifier: verifier } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends 500 when the manager throws error', async () => {
            const verifier = 'verifier query param';
            responseMock.setup(r => r.send(500)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.authenticate(verifier)).returns(() => Promise.reject(new Error()));

            const req = { query: { accountId, oauth_verifier: verifier, returnUrl: '/' } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends 401 when authentication fails', async () => {
            const verifier = 'verifier query param';
            responseMock.setup(r => r.send(401)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.authenticate(verifier)).returns(async () => undefined);

            const req = { query: { accountId, oauth_verifier: verifier, returnUrl: '/' } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('redirects to return url', async () => {
            const token: AccessToken = {
                oauth_token: 'token',
                oauth_token_secret: 'secret',
            };

            const verifier = 'verifier query param';
            const returnUrl = '/my-path';
            responseMock
                .setup(r => r.redirect(`http://localhost${returnUrl}?connection=xero`, nextMock.object))
                .verifiable(TypeMoq.Times.once());

            connectionManagerMock.setup(m => m.authenticate(verifier)).returns(async () => token);

            const req = {
                query: {
                    accountId,
                    oauth_verifier: verifier,
                    returnUrl,
                },
            } as restify.Request;

            await controller.callback(req, responseMock.object, nextMock.object);
        });
    });

    describe('payhawk()', () => {
        test('sends 400 if manager is not authenticated', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => undefined);

            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId } } as restify.Request;

            await controller.payhawk(req, responseMock.object);
        });

        test('sends 400 if current access token is expired', async () => {
            const oldExpiry = new Date();
            oldExpiry.setHours(oldExpiry.getHours() - 1);
            const accessToken: AccessToken = { oauth_token: 'auth token', oauth_token_secret: 'secret', oauth_expires_at: oldExpiry };
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId } } as restify.Request;

            await controller.payhawk(req, responseMock.object);
        });

        test('sends 400 for unknown event', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as AccessToken));

            const req = { body: { accountId, event: 'some unknown event' } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call exportExpense for that event', async () => {
            const expire = new Date();
            expire.setHours(expire.getHours() + 1);
            const accessToken: AccessToken = { oauth_token: 'auth token', oauth_token_secret: 'secret', oauth_expires_at: expire };
            const apiKey = 'payhawk api key';
            const expenseId = 'expId';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            integrationManagerMock
                .setup(m => m.exportExpense(expenseId))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExportExpense, data: { expenseId } } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call exportTransfers for that event', async () => {
            const expire = new Date();
            expire.setHours(expire.getHours() + 1);
            const accessToken: AccessToken = { oauth_token: 'auth token', oauth_token_secret: 'secret', oauth_expires_at: expire };
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            const exportData = {
                startDate: new Date().toISOString(),
                endDate: new Date().toISOString(),
            };

            integrationManagerMock
                .setup(m => m.exportTransfers(exportData.startDate, exportData.endDate))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExportTransfers, data: exportData } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 500 if payload does not contain payload data for exportExpense', async () => {
            const expire = new Date();
            expire.setHours(expire.getHours() + 1);
            const accessToken: AccessToken = { oauth_token: 'auth token', oauth_token_secret: 'secret', oauth_expires_at: expire };
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            loggerMock.setup(l => l.error(TypeMoq.It.isAny())).verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(500))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExportExpense, data: undefined } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 500 if payload does not contain payload data for exportTransfers', async () => {
            const expire = new Date();
            expire.setHours(expire.getHours() + 1);
            const accessToken: AccessToken = { oauth_token: 'auth token', oauth_token_secret: 'secret', oauth_expires_at: expire };
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            loggerMock.setup(l => l.error(TypeMoq.It.isAny())).verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(500))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExportTransfers, data: undefined } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call synchronizeChartOfAccounts for that event', async () => {
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as AccessToken));

            integrationManagerMock
                .setup(m => m.synchronizeChartOfAccounts())
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.SynchronizeChartOfAccount } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 500 and logs error if manager throws', async () => {
            const apiKey = 'payhawk api key';
            const err = new Error('expected error');
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as AccessToken));

            integrationManagerMock
                .setup(m => m.synchronizeChartOfAccounts())
                .returns(() => Promise.reject(err))
                .verifiable(TypeMoq.Times.once());

            loggerMock.setup(l => l.error(err)).verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(500))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.SynchronizeChartOfAccount } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });
    });
});
