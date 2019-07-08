import * as restify from 'restify';
import * as TypeMoq from 'typemoq';

import { Integration, XeroConnection } from 'src/managers';
import { Controller } from './Controller';
import { PayhawkEvent } from './PayhawkEvent';

describe('Controller', () => {
    const accountId = 'accountId';
    let connectionManagerMock: TypeMoq.IMock<XeroConnection.IManager>;
    let integrationManagerMock: TypeMoq.IMock<Integration.IManager>;
    let callbackHtmlHandlerMock: TypeMoq.IMock<restify.RequestHandler>;
    let responseMock: TypeMoq.IMock<restify.Response>;
    let nextMock: TypeMoq.IMock<restify.Next>;

    let controller: Controller;

    beforeEach(() => {
        connectionManagerMock = TypeMoq.Mock.ofType<XeroConnection.IManager>();
        integrationManagerMock = TypeMoq.Mock.ofType<Integration.IManager>();
        callbackHtmlHandlerMock = TypeMoq.Mock.ofType<restify.RequestHandler>();
        responseMock = TypeMoq.Mock.ofType<restify.Response>();
        nextMock = TypeMoq.Mock.ofType<restify.Next>();

        controller = new Controller(() => connectionManagerMock.object, () => integrationManagerMock.object, callbackHtmlHandlerMock.object);
    });

    afterEach(() => {
        connectionManagerMock.verifyAll();
        integrationManagerMock.verifyAll();
        callbackHtmlHandlerMock.verifyAll();
        responseMock.verifyAll();
        nextMock.verifyAll();
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

        test('sends 500 when the manager throws error', async () => {
            const verifier = 'verifier query param';
            responseMock.setup(r => r.send(500)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.authenticate(verifier)).returns(() => Promise.reject(new Error()));

            const req = { query: { accountId, oauth_verifier: verifier } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends 401 when authentication fails', async () => {
            const verifier = 'verifier query param';
            responseMock.setup(r => r.send(401)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.authenticate(verifier)).returns(async () => false);

            const req = { query: { accountId, oauth_verifier: verifier } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('authenticates and passes the request to callback html handler', async () => {
            const verifier = 'verifier query param';
            connectionManagerMock
                .setup(m => m.authenticate(verifier)).returns(async () => true)
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId, oauth_verifier: verifier } } as restify.Request;
            callbackHtmlHandlerMock
                .setup(c => c(req, responseMock.object, nextMock.object))
                .verifiable(TypeMoq.Times.once());

            await controller.callback(req, responseMock.object, nextMock.object);
        });
    });

    describe('payhawk()', () => {
        test('sends 400 if manager is not authenticated', async () => {
            connectionManagerMock
                .setup(m => m.isAuthenticated())
                .returns(() => false);

            responseMock
                .setup(r => r.send(400, TypeMoq.It.isAnyString()))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId } } as restify.Request;

            await controller.payhawk(req, responseMock.object);
        });

        test('sends 400 for unknown event', async () => {
            connectionManagerMock
                .setup(m => m.isAuthenticated())
                .returns(() => true);

            const req = { body: { accountId, event: 'some unknown event' } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call synchronizeChartOfAccounts for that event', async () => {
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.isAuthenticated())
                .returns(() => true);

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
    });
});
