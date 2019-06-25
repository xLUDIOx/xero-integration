import * as restify from 'restify';

import { IPayhawkPayload } from './IPayhawkPayload';
import { IManagerFactory } from './manager';
import { PayhawkEvent } from './PayhawkEvent';

export class Controller {
    constructor(private readonly managerFactory: IManagerFactory,
                private readonly callbackHtmlHandler: restify.RequestHandler) {
    }

    async connect(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (!req.query.accountId) {
            res.send(400, 'Missing accountId query parameter');
            return;
        }

        try {
            const accountId = req.query.accountId;
            const authoriseUrl = await this.managerFactory(accountId).getXeroAuthorizationUrl();

            res.redirect(authoriseUrl, next);
        } catch (e) {
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

        try {
            const manager = this.managerFactory(accountId);
            if (await manager.xeroAuthenticate(oauthVerifier)) {
                this.callbackHtmlHandler(req, res, next);
            } else {
                res.send(401);
            }
        } catch {
            res.send(500);
        }
    }

    async payhawk(req: restify.Request, res: restify.Response) {
        const payload = req.body as IPayhawkPayload;
        const manager = this.managerFactory(payload.accountId);
        if (!manager.isXeroAuthenticated()) {
            res.send(400, 'Unable to execute request because you do not have a valid Xero auth session');
            return;
        }

        switch (payload.event) {
            case PayhawkEvent.SynchronizeChartOfAccount:
                await manager.synchronizeChartOfAccounts(payload.apiKey);
                break;
            default:
                res.send(400, 'Unknown event');
                return;
        }

        res.send(204);
    }
}
