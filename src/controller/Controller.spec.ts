import { TokenSet } from 'openid-client';
import * as restify from 'restify';
import * as TypeMoq from 'typemoq';

import { IConfig } from '../Config';
import { Integration, XeroConnection } from '../managers';
import { ITokenSet } from '../store';
import { ForbiddenError, ILogger, OperationNotAllowedError } from '../utils';
import { Controller } from './Controller';
import { ConnectionMessage } from './IConnectionStatus';
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

        controller = new Controller(
            () => connectionManagerMock.object,
            () => integrationManagerMock.object,
            configMock.object,
            loggerMock.object,
        );
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
            const req = { query: {} } as restify.Request;

            await expect(controller.connect(req, responseMock.object, nextMock.object))
                .rejects
                .toThrowError('Missing required query parameter: accountId.');
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
        test('sends status 400 when missing state query parameter', async () => {
            const req = { query: { code: '' } } as restify.Request;

            await expect(controller.callback(req, responseMock.object, nextMock.object))
                .rejects
                .toThrowError('Missing required query parameter: state.');
        });

        test('sends 500 when the manager throws error', async () => {
            const req = {
                url: 'https://login.xero.com/identity/connect/authorize?client_id=C50C5AE905A247238EFD0BA93CA7D02A&scope=accounting.settings+accounting.transactions+accounting.attachments+accounting.contacts&response_type=code&redirect_uri=https%3A%2F%2Fxero-adapter-local.payhawk.io%2Fcallback&state=YWNjb3VudElkPXBheWhhd2tfZDFhYTIyNTQmcmV0dXJuVXJsPSUyRg%3D%3D',
                query: { code: 'code', state: 'YWNjb3VudElkPXBlc2hvXzEyMyZyZXR1cm5Vcmw9L215LXBhdGg=' },
            } as restify.Request;

            responseMock.setup(r => r.send(500)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.authenticate(req.url!)).returns(() => Promise.reject(new Error()));

            await controller.callback(req, responseMock.object, nextMock.object);
        });

        test('sends 401 when authentication fails', async () => {
            const req = { url: '', query: { code: 'code', state: 'YWNjb3VudElkPXBlc2hvXzEyMyZyZXR1cm5Vcmw9Lw==' } } as restify.Request;

            responseMock.setup(r => r.send(401)).verifiable(TypeMoq.Times.once());
            connectionManagerMock.setup(m => m.authenticate(req.url!)).returns(async () => undefined);

            await controller.callback(req, responseMock.object, nextMock.object);
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

            connectionManagerMock.setup(m => m.authenticate(req.url!)).returns(async () => token);

            await controller.callback(req, responseMock.object, nextMock.object);
        });
    });

    describe('payhawk()', () => {
        test('sends 400 if manager is not authenticated', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => undefined);

            responseMock
                .setup(r => r.send(401))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId } } as restify.Request;

            await controller.payhawk(req, responseMock.object);
        });

        test('sends 400 for unknown event', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as ITokenSet));

            responseMock
                .setup(r => r.send(400, 'Unknown event'))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, event: 'some unknown event' } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call exportExpense for that event', async () => {
            const accessToken = createAccessToken();
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

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExpenseExport, data: { expenseId } } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('logs warning if operation is not allowed', async () => {
            const accessToken = createAccessToken();
            const apiKey = 'payhawk api key';
            const expenseId = 'expId';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            integrationManagerMock
                .setup(m => m.exportExpense(expenseId))
                .returns(() => Promise.reject(new OperationNotAllowedError('Error.')))
                .verifiable(TypeMoq.Times.once());

            loggerMock
                .setup(l => l.warn(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExpenseExport, data: { expenseId } } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call exportTransfers for that event', async () => {
            const accessToken = createAccessToken();
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

            const req = { body: { accountId, apiKey, event: PayhawkEvent.TransfersExport, data: exportData } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 500 if payload does not contain payload data for exportExpense', async () => {
            const accessToken = createAccessToken();
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            loggerMock.setup(l => l.error(TypeMoq.It.isAny())).verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(500))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ExpenseExport, data: undefined } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 500 if payload does not contain payload data for exportTransfers', async () => {
            const accessToken = createAccessToken();
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            loggerMock.setup(l => l.error(TypeMoq.It.isAny())).verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(500))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.TransfersExport, data: undefined } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 204 and call synchronizeChartOfAccounts for that event', async () => {
            const apiKey = 'payhawk api key';
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as ITokenSet));

            integrationManagerMock
                .setup(m => m.synchronizeChartOfAccounts())
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ChartOfAccountSynchronize } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });

        test('send 500 and logs error if manager throws', async () => {
            const apiKey = 'payhawk api key';
            const err = new Error('expected error');
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as ITokenSet));

            integrationManagerMock
                .setup(m => m.synchronizeChartOfAccounts())
                .returns(() => Promise.reject(err))
                .verifiable(TypeMoq.Times.once());

            loggerMock.setup(l => l.error(err)).verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(500))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, apiKey, event: PayhawkEvent.ChartOfAccountSynchronize } } as restify.Request;
            await controller.payhawk(req, responseMock.object);
        });
    });

    describe('getConnectionStatus()', () => {
        test('returns true if token is valid and request succeeds', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => createAccessToken());

            integrationManagerMock
                .setup(m => m.getOrganisationName())
                .returns(() => Promise.resolve('Demo GmbH'))
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(200, { isAlive: true }))
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
                .setup(m => m.getAccessToken())
                .returns(async () => createAccessToken());

            integrationManagerMock
                .setup(m => m.getOrganisationName())
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
                .setup(m => m.getAccessToken())
                .returns(async () => createAccessToken());

            const error = new Error('Oops, something broke...');
            integrationManagerMock
                .setup(m => m.getOrganisationName())
                .throws(error)
                .verifiable(TypeMoq.Times.once());

            const req = { query: { accountId } } as restify.Request;

            responseMock
                .setup(r => r.send(200, { isAlive: false }))
                .verifiable(TypeMoq.Times.once());

            loggerMock.setup(l => l.error(error))
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
