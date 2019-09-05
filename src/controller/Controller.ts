import * as restify from 'restify';

import { URL } from 'url';
import { IConfig } from '../Config';
import { Integration, XeroConnection } from '../managers';
import { ILogger } from '../utils';
import { IPayhawkPayload } from './IPayhawkPayload';
import { PayhawkEvent } from './PayhawkEvent';

export class Controller {
    constructor(private readonly baseLogger: ILogger,
                private readonly connectionManagerFactory: XeroConnection.IManagerFactory,
                private readonly integrationManagerFactory: Integration.IManagerFactory,
                private readonly config: IConfig) {
    }

    async connect(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (!req.query.accountId) {
            res.send(400, 'Missing accountId query parameter');
            return;
        }

        const returnUrl = req.query.returnUrl || '/';

        const accountId = req.query.accountId;
        const logger = this.baseLogger.child({ accountId }, req);

        try {
            const authoriseUrl = await this.connectionManagerFactory(accountId, returnUrl).getAuthorizationUrl();
            res.redirect(authoriseUrl, next);
        } catch (err) {
            logger.error(err);
            res.send(500);
        }
    }

    async callback(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (!req.query.accountId) {
            res.send(400, 'Missing accountId query parameter');
            return;
        }

        if (!req.query.oauth_verifier) {
            res.send(400, 'Missing oauth_verifier query parameter');
            return;
        }

        if (!req.query.returnUrl) {
            res.send(400, 'Missing returnUrl query parameter');
            return;
        }

        const accountId: string = req.query.accountId;
        const oauthVerifier: string = req.query.oauth_verifier;
        const returnUrl: string = req.query.returnUrl;

        const logger = this.baseLogger.child({ accountId }, req);

        try {
            const manager = this.connectionManagerFactory(accountId);
            if (await manager.authenticate(oauthVerifier)) {
                const absoluteReturnUrl = `${this.config.portalUrl}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}`;
                const url = new URL(absoluteReturnUrl);
                url.searchParams.append('connection', 'xero');

                res.redirect(url.toString(), next);
            } else {
                res.send(401);
            }
        } catch (err) {
            logger.error(err);
            res.send(500);
        }
    }

    async payhawk(req: restify.Request, res: restify.Response) {
        const payload = req.body as IPayhawkPayload;
        const connectionManager = this.connectionManagerFactory(payload.accountId);
        const xeroAccessToken = await connectionManager.getAccessToken();
        if (!xeroAccessToken || (xeroAccessToken.oauth_expires_at && xeroAccessToken.oauth_expires_at < new Date())) {
            res.send(400, 'Unable to execute request because you do not have a valid Xero auth session');
            return;
        }

        let logger = this.baseLogger.child({ accountId: payload.accountId }, req);
        const integrationManager = this.integrationManagerFactory(xeroAccessToken, payload.accountId, payload.apiKey);

        try {
            logger = logger.child({ event: payload.event });
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
                    await integrationManager.exportExpense(expenseId);
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

                    await integrationManager.exportTransfers(payload.data.startDate, payload.data.endDate);
                    break;
                case PayhawkEvent.SynchronizeChartOfAccount:
                    await integrationManager.synchronizeChartOfAccounts();
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
}
