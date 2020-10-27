import { URL, URLSearchParams } from 'url';

import { boundMethod } from 'autobind-decorator';
import { Next, Request, Response } from 'restify';

import { Integration, XeroConnection } from '@managers';
import { ForbiddenError, fromBase64, ILogger, requiredQueryParams } from '@utils';

import { IConfig } from '../Config';
import { ConnectionMessage, IConnectionStatus } from './IConnectionStatus';

export class AuthController {
    constructor(
        private readonly connectionManagerFactory: XeroConnection.IManagerFactory,
        private readonly integrationManagerFactory: Integration.IManagerFactory,
        private readonly config: IConfig,
        private readonly baseLogger: ILogger,
    ) {
    }

    @boundMethod
    @requiredQueryParams('accountId')
    async connect(req: Request, res: Response, next: Next) {
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

    @boundMethod
    @requiredQueryParams('state')
    async callback(req: Request, res: Response, next: Next) {
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
            const integrationManager = this.integrationManagerFactory({ accessToken, tenantId, accountId }, logger);

            const organisationName = await integrationManager.getOrganisationName();

            url.searchParams.append('connection', 'xero');
            if (organisationName) {
                url.searchParams.append('label', organisationName);
            }

            res.redirect(url.toString(), next);

            logger.info('Callback complete');
        } catch (err) {
            logger.error(err);
            res.send(500);
        }
    }

    @boundMethod
    @requiredQueryParams('accountId')
    async getConnectionStatus(req: Request, res: Response) {
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
            const label = await integrationManager.getOrganisationName();

            return { isAlive: true, label };
        } catch (err) {
            if (err instanceof ForbiddenError) {
                return { isAlive: false, message: ConnectionMessage.DisconnectedRemotely };
            }

            logger.error(err);

            return { isAlive: false };
        }
    }
}
