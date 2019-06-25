import * as restify from 'restify';

import { IManagerFactory } from './manager';

export class Controller {
    constructor(private readonly managerFactory: IManagerFactory,
                private readonly callbackHtmlHandler: restify.RequestHandler) {
    }

    async connect(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (!req.params.accountId) {
            res.send(404);
            return;
        }

        try {
            const accountId = req.params.accountId;
            const authoriseUrl = await this.managerFactory(accountId).getAuthorizationUrl();

            res.redirect(authoriseUrl, next);
        } catch (e) {
            res.send(500);
        }
    }

    async callback(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (!req.params.accountId) {
            res.send(404);
            return;
        }

        if (!req.query.oauth_verifier) {
            res.send(400, 'Missing oauth_verifier query parameter');
            return;
        }

        const accountId = req.params.accountId;

        try {
            const oauthVerifier = req.query.oauth_verifier;
            const manager = this.managerFactory(accountId);
            await manager.authenticate(oauthVerifier);

            this.callbackHtmlHandler(req, res, next);
        } catch (e) {
            res.send(500);
        }
    }
}
