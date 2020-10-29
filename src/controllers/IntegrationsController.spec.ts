import { TokenSet } from 'openid-client';
import * as restify from 'restify';
import * as TypeMoq from 'typemoq';

import { Integration, XeroConnection } from '@managers';
import { AccessTokens } from '@stores';
import { ILogger, OperationNotAllowedError } from '@utils';

import { IConfig } from '../Config';
import { IntegrationsController } from './IntegrationsController';
import { PayhawkEvent } from './PayhawkEvent';

describe('IntegrationsController', () => {
    const accountId = 'accountId';
    let connectionManagerMock: TypeMoq.IMock<XeroConnection.IManager>;
    let integrationManagerMock: TypeMoq.IMock<Integration.IManager>;
    let configMock: TypeMoq.IMock<IConfig>;
    let responseMock: TypeMoq.IMock<restify.Response>;
    let nextMock: TypeMoq.IMock<restify.Next>;
    let loggerMock: TypeMoq.IMock<ILogger>;

    let controller: IntegrationsController;

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

        integrationManagerMock
            .setup((m: any) => m.then)
            .returns(() => Promise.resolve());

        controller = new IntegrationsController(
            () => connectionManagerMock.object,
            () => integrationManagerMock.object,
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

    describe('payhawk()', () => {
        test('sends 400 if manager is not authenticated', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => undefined);

            responseMock
                .setup(r => r.send(401))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId } } as restify.Request;

            await controller.handlePayhawkEvent(req, responseMock.object);
        });

        test('sends 400 for unknown event', async () => {
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as AccessTokens.ITokenSet));

            responseMock
                .setup(r => r.send(400, 'Unknown event'))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, event: 'some unknown event' } } as restify.Request;
            await controller.handlePayhawkEvent(req, responseMock.object);
        });

        test('send 204 and call exportExpense for that event', async () => {
            const accessToken = createAccessToken();
            const expenseId = 'expId';

            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

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

            const req = { body: { accountId, event: PayhawkEvent.ExpenseExport, data: { expenseId } } } as restify.Request;
            await controller.handlePayhawkEvent(req, responseMock.object);
        });

        test('logs warning if operation is not allowed', async () => {
            const accessToken = createAccessToken();
            const expenseId = 'expId';

            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

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

            const req = { body: { accountId, event: PayhawkEvent.ExpenseExport, data: { expenseId } } } as restify.Request;
            await controller.handlePayhawkEvent(req, responseMock.object);
        });

        test('send 204 and call exportTransfers for that event', async () => {
            const accessToken = createAccessToken();

            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

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

            const req = { body: { accountId, event: PayhawkEvent.TransfersExport, data: exportData } } as restify.Request;
            await controller.handlePayhawkEvent(req, responseMock.object);
        });

        test('throw err if payload does not contain payload data for exportExpense', async () => {
            const accessToken = createAccessToken();
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            const req = { body: { accountId, event: PayhawkEvent.ExpenseExport, data: undefined } } as restify.Request;
            await expect(controller.handlePayhawkEvent(req, responseMock.object)).rejects.toThrow();
        });

        test('send 500 if payload does not contain payload data for exportTransfers', async () => {
            const accessToken = createAccessToken();
            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => accessToken);

            const req = { body: { accountId, event: PayhawkEvent.TransfersExport, data: undefined } } as restify.Request;
            await expect(controller.handlePayhawkEvent(req, responseMock.object)).rejects.toThrow();
        });

        test('send 204 and call synchronizeChartOfAccounts for that event', async () => {
            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as AccessTokens.ITokenSet));

            integrationManagerMock
                .setup(m => m.synchronizeChartOfAccounts())
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, event: PayhawkEvent.ChartOfAccountSynchronize } } as restify.Request;
            await controller.handlePayhawkEvent(req, responseMock.object);
        });

        test('throw error if manager throws', async () => {
            const err = new Error('expected error');

            connectionManagerMock
                .setup(m => m.getActiveTenantId())
                .returns(async () => '1')
                .verifiable(TypeMoq.Times.once());

            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => ({} as AccessTokens.ITokenSet));

            integrationManagerMock
                .setup(m => m.synchronizeChartOfAccounts())
                .returns(() => Promise.reject(err))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, event: PayhawkEvent.ChartOfAccountSynchronize } } as restify.Request;
            await expect(controller.handlePayhawkEvent(req, responseMock.object)).rejects.toThrow();
        });

        test('handles ApiKeySet and does not throw', async () => {
            const apiKey = 'payhawk api key';

            connectionManagerMock
                .setup(m => m.getAccessToken())
                .returns(async () => undefined);

            connectionManagerMock
                .setup(m => m.setPayhawkApiKey(apiKey))
                .returns(async () => {/** */ })
                .verifiable(TypeMoq.Times.once());

            responseMock
                .setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            const req = { body: { accountId, event: PayhawkEvent.ApiKeySet, data: { apiKey } } } as restify.Request;

            await controller.handlePayhawkEvent(req, responseMock.object);
        });
    });
});

function createAccessToken(expired: boolean = false): AccessTokens.ITokenSet {
    return new TokenSet({
        access_token: 'token',
        expires_at: Math.floor(Date.now() / 1000) + (expired ? -1 : 1) * 30 * 60,
    });
}
