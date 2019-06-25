import * as restify from 'restify';
import * as TypeMoq from 'typemoq';

import { Controller } from '.';
import { IManager, IManagerFactory } from './manager';

describe('Controller', () => {
    const accountId = 'accountId';
    let managerFactoryMock: TypeMoq.IMock<IManagerFactory>;
    let managerMock: TypeMoq.IMock<IManager>;
    let callbackHtmlHandlerMock: TypeMoq.IMock<restify.RequestHandler>;
    let responseMock: TypeMoq.IMock<restify.Response>;
    let nextMock: TypeMoq.IMock<restify.Next>;

    let controller: Controller;

    beforeEach(() => {
        managerFactoryMock = TypeMoq.Mock.ofType<IManagerFactory>();
        managerMock = TypeMoq.Mock.ofType<IManager>();
        callbackHtmlHandlerMock = TypeMoq.Mock.ofType<restify.RequestHandler>();
        responseMock = TypeMoq.Mock.ofType<restify.Response>();
        nextMock = TypeMoq.Mock.ofType<restify.Next>();

        managerFactoryMock.setup(f => f(accountId)).returns(() => managerMock.object);
        controller = new Controller(managerFactoryMock.object, callbackHtmlHandlerMock.object);
    });

    afterEach(() => {
        managerFactoryMock.verifyAll();
        managerMock.verifyAll();
        callbackHtmlHandlerMock.verifyAll();
        responseMock.verifyAll();
        nextMock.verifyAll();
    });

    describe('connect()', () => {
        test('sends status 404 when missing accountId route parameter', async () => {
            responseMock.setup(r => r.send(404)).verifiable(TypeMoq.Times.once());

            const req = { params: {} } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });

        test('sends 500 when the manager throws error', async () => {
            responseMock.setup(r => r.send(500)).verifiable(TypeMoq.Times.once());
            managerMock.setup(m => m.getAuthorizationUrl()).returns(() => Promise.reject(new Error()));

            const req = { params: { accountId } } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });

        test('redirects to authorization URL', async () => {
            const authorizationUrl = 'expected authorization url';
            managerMock.setup(m => m.getAuthorizationUrl()).returns(async () => authorizationUrl);
            responseMock.setup(r => r.redirect(authorizationUrl, nextMock.object)).verifiable(TypeMoq.Times.once());

            const req = { params: { accountId } } as restify.Request;
            await controller.connect(req, responseMock.object, nextMock.object);
        });
    });

    describe('callback()', () => {
        test('sends status 404 when missing accountId route parameter', async () => {
            responseMock.setup(r => r.send(404)).verifiable(TypeMoq.Times.once());

            const req = { params: {} } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends 500 when the manager throws error', async () => {
            const verifier = 'verifier query param';
            responseMock.setup(r => r.send(500)).verifiable(TypeMoq.Times.once());
            managerMock.setup(m => m.authenticate(verifier)).returns(() => Promise.reject(new Error()));

            const req = { params: { accountId }, query: { oauth_verifier: verifier } } as restify.Request;
            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('authenticates and passes the request to callback html handler', async () => {
            const verifier = 'verifier query param';
            managerMock
                .setup(m => m.authenticate(verifier)).returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            const req = { params: { accountId }, query: { oauth_verifier: verifier } } as restify.Request;
            callbackHtmlHandlerMock
                .setup(c => c(req, responseMock.object, nextMock.object))
                .verifiable(TypeMoq.Times.once());

            await controller.callback(req, responseMock.object, nextMock.object);
        });
    });
});
