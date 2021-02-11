import * as crypto from 'crypto';
import { URL, URLSearchParams } from 'url';

import { boundMethod } from 'autobind-decorator';
import { Next, Request, Response } from 'restify';

import { XeroConnection } from '@managers';
import { Xero } from '@services';
import { ITokenSet } from '@shared';
import { ForbiddenError, fromBase64, ILogger, requiredBodyParams, requiredQueryParams, TenantConflictError, toBase64 } from '@utils';

import { IConfig } from '../Config';
import { ConnectionMessage, IConnectionStatus } from './IConnectionStatus';

export class AuthController {
    constructor(
        private readonly connectionManagerFactory: XeroConnection.IManagerFactory,
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
        const authorizationUrl = connectionManager.getAuthorizationUrl();
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
            return res.send(500);
        }

        const absoluteReturnUrl = `${this.config.portalUrl}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}`;
        const url = new URL(absoluteReturnUrl);

        let logger = this.baseLogger.child({ accountId }, req);
        if (error) {
            logger.info('Xero authorization declined. Redirecting to portal...');
            return res.redirect(url.toString(), next);
        }

        logger.info('Callback start');

        if (!code) {
            logger.error(Error('Auth code is required for retrieving access token'));
            return res.send(500);
        }

        try {
            const connectionManager = this.connectionManagerFactory({ accountId }, logger);
            const accessToken = await connectionManager.authenticate(code);
            const authorizedTenants = await connectionManager.getAuthorizedTenants(accessToken);

            logger = logger.child({
                authorizedTenants: authorizedTenants.map(t => ({
                    tenantId: t.tenantId,
                    tenantName: t.tenantName,
                })),
            });

            // should never happen
            if (authorizedTenants.length === 0) {
                logger.error(Error('No authorized tenants'));
                return res.redirect(url.toString(), next);
            }

            if (authorizedTenants.length > 1) {
                logger.info('Multiple tenants authorized, rendering tenant selector');

                const nonce = crypto.randomBytes(16).toString('base64');
                const body = this.getTenantSelectorHtml(
                    accountId,
                    authorizedTenants,
                    returnUrl,
                    toBase64(JSON.stringify(accessToken)),
                    nonce,
                );

                const headers = this.getTenantSelectorHeaders(body, nonce);

                res.writeHead(200, headers);

                res.write(body);
                res.end();
                return;
            }

            logger.info('Single tenant is authorized, connecting...');

            const tenantId = authorizedTenants[0].tenantId;
            if (!tenantId) {
                throw Error('No active tenant found for this account after callback received');
            }

            const redirectUrl = await this.connectSingleTenant(
                connectionManager,
                accessToken,
                tenantId,
                url,
            );

            res.redirect(redirectUrl.toString(), next);

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
        const { accountId, tenantId, accessToken: accessTokenString, returnUrl } = req.body;

        const logger = this.baseLogger.child({ accountId, tenantId }, req);

        logger.info('Tenant selected, connecting...');

        const connectionManager = this.connectionManagerFactory({ accountId }, logger);
        const accessToken = JSON.parse(fromBase64(accessTokenString));

        const absoluteReturnUrl = `${this.config.portalUrl}${returnUrl.startsWith('/') ? returnUrl : `/${returnUrl}`}`;
        const url = new URL(absoluteReturnUrl);

        const redirectUrl = await this.connectSingleTenant(
            connectionManager,
            accessToken,
            tenantId,
            url,
        );

        res.redirect(redirectUrl, next);
    }

    private async connectSingleTenant(
        connectionManager: XeroConnection.IManager,
        accessToken: ITokenSet,
        tenantId: string,
        redirectUrl: URL,
    ) {
        redirectUrl.searchParams.append('connection', 'xero');

        try {
            await connectionManager.createAccessToken(accessToken, tenantId);
        } catch (err) {
            if (err instanceof TenantConflictError) {
                const authorizedTenants = await connectionManager.getAuthorizedTenants(accessToken);
                const tenant = authorizedTenants.find(t => t.tenantId === err.tenantId);

                redirectUrl.searchParams.set('errorType', 'conflict');
                redirectUrl.searchParams.set('organisationName', tenant!.tenantName);
                redirectUrl.searchParams.set('conflictingAccountId', err.conflictingAccountId);

                return redirectUrl.toString();
            }
        }

        await connectionManager.createAccount(tenantId);

        return redirectUrl.toString();
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
            const tenants = await connectionManager.getAuthorizedTenants(xeroAccessToken);
            const organisation = tenants.find(t => t.tenantId === tenantId);
            if (!organisation) {
                return { isAlive: false, message: ConnectionMessage.DisconnectedRemotely };
            }

            const title = organisation.tenantName;

            return { isAlive: true, title };
        } catch (err) {
            if (err instanceof ForbiddenError) {
                return { isAlive: false, message: ConnectionMessage.DisconnectedRemotely };
            }

            return { isAlive: false };
        }
    }

    private getTenantSelectorHtml(accountId: string, tenants: Xero.ITenant[], returnUrl: string, token: string, nonce: string) {
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
                                <label for="tenantSelector">Select organisation</label>
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
                            <div class="form-group">
                                <input type="hidden" name="accessToken" value="${token}" />
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

    private getTenantSelectorHeaders(body: any, nonce: string) {
        return {
            'content-length': Buffer.byteLength(body),
            'content-type': 'text/html',
            'strict-transport-security': 'max-age=63072000; includeSubdomains; preload',
            'content-security-policy': `default-src 'none'; img-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'`,
            'x-content-type-options': 'nosniff',
            'x-xss-protection': '1; mode=block',
            'referrer-policy': 'same-origin',
            'x-permitted-cross-domain-policies': 'none',
            'x-frame-options': 'DENY',
        };
    }
}
