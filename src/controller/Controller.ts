import * as restify from 'restify';

import { Integration, XeroConnection } from '../managers';
import { ILogger } from '../utils/logger';
import { IPayhawkPayload } from './IPayhawkPayload';
import { PayhawkEvent } from './PayhawkEvent';

export class Controller {
    constructor(private readonly baseLogger: ILogger,
                private readonly connectionManagerFactory: XeroConnection.IManagerFactory,
                private readonly integrationManagerFactory: Integration.IManagerFactory,
                private readonly callbackHtmlHandler: restify.RequestHandler) {
    }

    async connect(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (!req.query.accountId) {
            res.send(400, 'Missing accountId query parameter');
            return;
        }

        const accountId = req.query.accountId;
        const logger = this.baseLogger.child({ accountId }, req);

        try {
            const authoriseUrl = await this.connectionManagerFactory(accountId).getAuthorizationUrl();
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

        const accountId = req.query.accountId;
        const oauthVerifier = req.query.oauth_verifier;

        const logger = this.baseLogger.child({ accountId }, req);

        try {
            const manager = this.connectionManagerFactory(accountId);
            if (await manager.authenticate(oauthVerifier)) {
                this.callbackHtmlHandler(req, res, next);
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

        const logger = this.baseLogger.child({ accountId: payload.accountId }, req);
        const integrationManager = this.integrationManagerFactory(xeroAccessToken, payload.accountId, payload.apiKey);

        try {
            switch (payload.event) {
                case PayhawkEvent.ExportExpense:
                    await integrationManager.exportExpense(payload.data.expenseId);
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
