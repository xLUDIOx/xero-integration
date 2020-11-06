import * as crypto from 'crypto';
import { URL, URLSearchParams } from 'url';

import { boundMethod } from 'autobind-decorator';
import { Next, Request, Response } from 'restify';
import { InternalServerError } from 'restify-errors';

import { Integration, XeroConnection } from '@managers';
import { ForbiddenError, fromBase64, ILogger, requiredBodyParams, requiredQueryParams } from '@utils';

import { IConfig } from '../Config';
import { Xero } from '../services';
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

        const connectionManager = this.connectionManagerFactory({ accountId, returnUrl }, logger);
        const authorizationUrl = await connectionManager.getAuthorizationUrl();
        res.redirect(authorizationUrl, next);

        logger.info('Connect completed');
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

            const authorizedTenants = await connectionManager.getAuthorizedTenants();

            // should never happen
            if (authorizedTenants.length === 0) {
                throw Error('No authorized tenants');
            }

            if (authorizedTenants.length > 1) {
                const nonce = crypto.randomBytes(16).toString('base64');
                const body = this.getTenantSelectorHtml(accountId, authorizedTenants, returnUrl, nonce);

                res.writeHead(200, {
                    'content-length': Buffer.byteLength(body),
                    'content-type': 'text/html',
                    'strict-transport-security': 'max-age=63072000; includeSubdomains; preload',
                    'content-security-policy': `default-src 'none'; img-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'`,
                    'x-content-type-options': 'nosniff',
                    'x-xss-protection': '1; mode=block',
                    'referrer-policy': 'same-origin',
                    'x-permitted-cross-domain-policies': 'none',
                    'x-frame-options': 'DENY',
                });

                res.write(body);
                res.end();
                return;
            }

            const tenantId = await connectionManager.getActiveTenantId();
            if (!tenantId) {
                throw Error('No active tenant found for this account after callback received');
            }

            const integrationManager = this.integrationManagerFactory({ accessToken, tenantId, accountId }, logger);

            const organisationName = await integrationManager.getOrganisationName();

            url.searchParams.append('connection', 'xero');
            if (organisationName) {
                url.searchParams.append('label', organisationName);
            }

            res.redirect(url.toString(), next);

            logger.info('Callback complete');
        } catch (err) {
            if (err instanceof ForbiddenError) {
                throw Error('Tenant ID in the database was not found in authorized tenants for this token. Disconnect should have been triggered before attempting to connect again.');
            }

            throw err;
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

    @boundMethod
    @requiredBodyParams('accountId', 'tenantId', 'returnUrl')
    async connectTenant(req: Request, res: Response, next: Next) {
        const { accountId, tenantId, returnUrl } = req.body;

        const logger = this.baseLogger.child({ accountId }, req);

        const connectionManager = this.connectionManagerFactory({ accountId }, logger);
        await connectionManager.connectTenant(tenantId);

        const accessToken = await connectionManager.getAccessToken();
        if (!accessToken) {
            throw new InternalServerError('No access token found');
        }

        const integrationManager = this.integrationManagerFactory({ accessToken, accountId, tenantId }, logger);
        const organisationName = await integrationManager.getOrganisationName();

        const absoluteReturnUrl = `${this.config.portalUrl}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}`;
        const url = new URL(absoluteReturnUrl);

        url.searchParams.append('connection', 'xero');
        if (organisationName) {
            url.searchParams.append('label', organisationName);
        }

        res.redirect(url.toString(), next);
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

            if (XeroConnection.isAccessTokenExpired(xeroAccessToken)) {
                return { isAlive: false, message: ConnectionMessage.TokenExpired };
            }

            const tenantId = await connectionManager.getActiveTenantId();
            if (!tenantId) {
                return { isAlive: false };
            }

            // try get some information from Xero to validate whether the token is still valid
            const integrationManager = this.integrationManagerFactory({ accessToken: xeroAccessToken, tenantId, accountId }, logger);
            const title = await integrationManager.getOrganisationName();

            return { isAlive: true, title };
        } catch (err) {
            if (err instanceof ForbiddenError) {
                return { isAlive: false, message: ConnectionMessage.DisconnectedRemotely };
            }

            logger.error(err);

            return { isAlive: false };
        }
    }

    private getTenantSelectorHtml(accountId: string, tenants: Xero.ITenant[], returnUrl: string, nonce: string) {
        // cspell: disable
        const body = `
            <html>
                <head>
                    <title>Payhawk</title>
                    <meta http-equiv="Pragma" content="no-cache" />
                    <meta http-equiv="Expires" content="-1″ />
                    <meta http-equiv="CACHE-CONTROL" content="NO-CACHE" />

                    <style nonce="${nonce}">
                        html {
                            font-family: "Helvetica Neue", Roboto, Helvetica, Arial, sans-serif;
                            font-size: 14px;
                        }

                        .phwk-tp-connect-page {
                            background-color: #f4f5f6;
                        }

                        .phwk-container {
                            width: fit-content;

                            margin-top: 12rem;
                            margin-left: auto;
                            margin-right: auto;
                        }

                        .tenant-selector-form {
                            border: 1px solid rgb(222, 226, 230);
                            background-color: white;
                            margin-top: 2rem;
                            padding: 2rem 4rem;
                        }

                        .form-group > label {
                            color: #9097a0;
                        }

                        button.btn-connect {
                            font-weight: 500;
                            background-color: #4189FF;
                            border-color: #4189FF;
                            border-radius: 17.5px;
                        }

                        button.btn-connect:hover {
                            background-color: #1B71FF;
                            border-color: #1B71FF;
                        }

                        img.phwk-logo {
                           display: block;
                           margin: auto;
                        }
                    </style>
                    <script
                        nonce="${nonce}"
                        src="https://code.jquery.com/jquery-3.5.1.slim.min.js"
                        integrity="sha256-4+XzXVhsDmqanXGHaHvgh1gMQKX40OUvDEBTu8JcmNs="
                        crossorigin="anonymous">
                    </script>
                    <link
                        nonce="${nonce}"
                        rel="stylesheet"
                        href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css"
                        integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z"
                        crossorigin="anonymous"
                    >
                    <script
                        nonce="${nonce}"
                        src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"
                        integrity="sha384-B4gt1jrGC7Jh4AgTPSdUtOBvfO8shuf57BaghqFfPlYxofvL8/KUEfYiJOMMV+rV"
                        crossorigin="anonymous">
                    </script>
                </head>
                <body class="phwk-tp-connect-page">
                    <div class="phwk-container">
                        <img class="phwk-logo" src="/images/logo.png" />
                        <form action="/connect-tenant" method="POST" class="tenant-selector-form">
                            <div class="form-group">
                                <label for="tenantSelector">Select tenant</label>
                                <select class="form-control" name="tenantId" id="tenantSelector">
                                    ${tenants.map(t => `<option value="${t.tenantId}">${t.tenantName}</option>`)}
                                </select>
                            </div>
                            <div class="form-group">
                                <input type="hidden" name="accountId" value="${accountId}" />
                            </div>
                            <div class="form-group">
                                <input type="hidden" name="returnUrl" value="${returnUrl}" />
                            </div>
                            <button type="submit" class="btn btn-primary mt-3 btn-connect">Continue</button>
                        </form>
                    </div>
                </body>
            </html>
        `;
        // cspell: enable

        return body;
    }
}
