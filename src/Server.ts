import * as restify from 'restify';

import { requestHandler } from '@utils';
import { AuthController, IntegrationsController } from '@web-api';

import { config } from './Config';

function securityHeadersMiddleware(): restify.RequestHandler {
    return (request: restify.Request, response: restify.Response, next: restify.Next) => {
        response.set({
            'X-Frame-Options': 'DENY',
            // cspell:disable-next
            'X-Content-Type-Options': 'nosniff',
            'X-XSS-Protection': '1; mode=block',
            'X-Permitted-Cross-Domain-Policies': 'none',
            'Content-Security-Policy': `default-src 'none'`,
        });
        next();
    };
}

export const createServer = (authController: AuthController, integrationsController: IntegrationsController): restify.Server => {
    const server = restify.createServer({ name: config.serviceName });

    server
        .use(restify.plugins.jsonBodyParser())
        .use(restify.plugins.urlEncodedBodyParser({ mapParams: false }))
        .use(restify.plugins.queryParser())
        .use(securityHeadersMiddleware());

    // Endpoint used to check whether the service is up and running
    server.get('/status', (req, res) => res.send(200, 'OK'));

    // Serve public static files
    server.get('/images/*', restify.plugins.serveStatic({
        directory: `${process.cwd()}/public`,
    }));

    server.get('/connect', requestHandler(authController.connect));
    server.post('/connect-tenant', requestHandler(authController.connectTenant));
    server.get('/callback', requestHandler(authController.callback));
    server.get('/payhawk/connection-status', requestHandler(authController.getConnectionStatus));

    server.post('/payhawk', requestHandler(integrationsController.handlePayhawkEvent));

    return server;
};
