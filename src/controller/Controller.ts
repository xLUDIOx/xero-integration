import { URL, URLSearchParams } from 'url';

import * as restify from 'restify';

import { IConfig } from '../Config';
import { Integration, XeroConnection } from '../managers';
import { DisconnectedRemotelyError, fromBase64, ILogger, OperationNotAllowedError, requiredQueryParams } from '../utils';
import { ConnectionMessage, IConnectionStatus } from './IConnectionStatus';
import { IPayhawkPayload } from './IPayhawkPayload';
import { PayhawkEvent } from './PayhawkEvent';

export class Controller {
    constructor(
        private readonly connectionManagerFactory: XeroConnection.IManagerFactory,
        private readonly integrationManagerFactory: Integration.IManagerFactory,
        private readonly config: IConfig,
        private readonly baseLogger: ILogger,
    ) {
    }

    @requiredQueryParams('accountId')
    async connect(req: restify.Request, res: restify.Response, next: restify.Next) {
        const { accountId, returnUrl: queryReturnUrl } = req.query;
        const returnUrl = queryReturnUrl || '/';

        const logger = this.baseLogger.child({ accountId, returnUrl }, req);

        logger.info('Connect started');

        try {
            const connectionManager = this.connectionManagerFactory({ accountId, returnUrl }, logger);
            const authorizationUrl = await connectionManager.getAuthorizationUrl();
            res.redirect(authorizationUrl, next);

            logger.info('Connect completed');
        } catch (err) {
            logger.error(err);
            res.send(500);
        }
    }

    @requiredQueryParams('state')
    async callback(req: restify.Request, res: restify.Response, next: restify.Next) {
        const { code, error, state: encodedState } = req.query;

        const state = new URLSearchParams(fromBase64(encodedState));
        const accountId = state.get('accountId');
        const returnUrl = state.get('returnUrl');
        if (!accountId || !returnUrl) {
            this.baseLogger.error(Error('State param does not contain required account ID and return URL'));
            res.send(500);
            return;
        }

        const absoluteReturnUrl = `${this.config.portalUrl}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}`;
        const url = new URL(absoluteReturnUrl);

        const logger = this.baseLogger.child({ accountId }, req);
        if (error) {
            logger.info('Xero authorization declined. Redirecting to portal...');

            url.searchParams.set('error', error);
            res.redirect(url.toString(), next);
            return;
        }

        logger.info('Callback start');

        if (!code) {
            logger.error(Error('Auth code is required for retrieving access token'));
            res.send(500);
            return;
        }

        try {
            const connectionManager = this.connectionManagerFactory({ accountId }, logger);
            const accessToken = await connectionManager.authenticate(req.url!);
            if (!accessToken) {
                logger.error(Error('Could not create access token from callback'));
                res.send(401);
                return;
            }

            const tenantId = await connectionManager.getActiveTenantId();
            const integrationManager = this.integrationManagerFactory({ accessToken, tenantId, accountId }, logger); // payhawk api key is not needed here
            const organisation = await integrationManager.getOrganisationName();

            url.searchParams.append('connection', 'xero');
            if (organisation) {
                url.searchParams.append('label', organisation);
            }

            res.redirect(url.toString(), next);

            logger.info('Callback complete');
        } catch (err) {
            logger.error(err);
            res.send(500);
        }
    }

    async payhawk(req: restify.Request, res: restify.Response) {
        const payload = req.body as IPayhawkPayload;

        let logger = this.baseLogger.child({ accountId: payload.accountId, event: payload.event }, req);

        const connectionManager = this.connectionManagerFactory({ accountId: payload.accountId }, logger);
        const xeroAccessToken = await connectionManager.getAccessToken();
        if (!xeroAccessToken) {
            logger.error(new Error('Unable to handle event because there is no valid access token'));

            res.send(401);
            return;
        }

        const tenantId = await connectionManager.getActiveTenantId();

        const integrationManager = this.integrationManagerFactory({ accessToken: xeroAccessToken, tenantId, accountId: payload.accountId, payhawkApiKey: payload.apiKey }, logger);

        try {
            switch (payload.event) {
                case PayhawkEvent.ExportExpense:
                    if (!payload.data) {
                        const error = new Error('No payload provided for ExportExpense event');
                        logger.error(error);
                        res.send(500);
                        return;
                    }

                    const expenseId = payload.data.expenseId;
                    if (!expenseId) {
                        const error = new Error('No expense ID provided in payload for ExportExpense event');
                        logger.error(error);
                        res.send(500);
                        return;
                    }

                    logger = logger.child({ expenseId });

                    logger.info(`Export expense started`);

                    try {
                        await integrationManager.exportExpense(expenseId);

                        logger.info(`Export expense completed`);
                    } catch (err) {
                        if (err instanceof OperationNotAllowedError) {
                            logger.warn(`[${err.name}]: ${err.message}`);
                        } else {
                            logger.error(err);
                            res.send(500);
                            return;
                        }
                    }
                    break;
                case PayhawkEvent.ExportTransfers:
                    if (!payload.data) {
                        const error = new Error('No payload provided for ExportTransfers event');
                        logger.error(error);
                        res.send(500);
                        return;
                    }

                    if (!payload.data.startDate || !payload.data.endDate) {
                        const error = new Error('No start or end date provided in payload for ExportTransfers event');
                        logger.error(error);
                        res.send(500);
                        return;
                    }

                    logger = logger.child({ startDate: payload.data.startDate, endDate: payload.data.endDate });

                    logger.info('Export transfers started');

                    await integrationManager.exportTransfers(payload.data.startDate, payload.data.endDate);

                    logger.info('Export transfers completed');
                    break;
                case PayhawkEvent.SynchronizeChartOfAccount:
                    logger.info('Sync chart of accounts started');

                    await integrationManager.synchronizeChartOfAccounts();

                    logger.info('Sync chart of accounts completed');
                    break;
                case PayhawkEvent.SynchronizeBankAccounts:
                    logger.info('Sync bank accounts started');

                    await integrationManager.synchronizeBankAccounts();

                    logger.info('Sync bank accounts completed');
                    break;
                default:
                    res.send(400, 'Unknown event');
                    return;
            }

            res.send(204);
        } catch (err) {
            logger.error(err);
            res.send(500);
        }
    }

    @requiredQueryParams('accountId')
    async getConnectionStatus(req: restify.Request, res: restify.Response) {
        const { accountId } = req.query;

        const logger = this.baseLogger.child({ accountId }, req);

        const connectionStatus = await this.resolveConnectionStatus(accountId, logger);

        res.send(200, connectionStatus);
    }

    private async resolveConnectionStatus(accountId: string, logger: ILogger): Promise<IConnectionStatus> {
        if (!accountId) {
            return { isAlive: false };
        }

        try {
            const connectionManager = this.connectionManagerFactory({ accountId }, logger);
            const xeroAccessToken = await connectionManager.getAccessToken();
            if (!xeroAccessToken) {
                return { isAlive: false };
            }

            if (xeroAccessToken.expired()) {
                return { isAlive: false, message: ConnectionMessage.TokenExpired };
            }

            const tenantId = await connectionManager.getActiveTenantId();

            // try get some information from Xero to validate whether the token is still valid
            const integrationManager = this.integrationManagerFactory({ accessToken: xeroAccessToken, tenantId, accountId }, logger);
            await integrationManager.getOrganisationName();

            return { isAlive: true };
        } catch (err) {
            if (err instanceof DisconnectedRemotelyError) {
                return { isAlive: false, message: ConnectionMessage.DisconnectedRemotely };
            }

            logger.error(err);

            return { isAlive: false };
        }
    }
}
