import * as restify from 'restify';

import { config } from './Config';
import { Controller } from './controller';

export const createServer = (controller: Controller): restify.Server => {
    const server = restify.createServer({ name: config.serviceName });

    server
        .use(restify.plugins.jsonBodyParser())
        .use(restify.plugins.queryParser());

    // Endpoint used to check whether the service is up and running
    server.get('/status', (req, res) => res.send(200, 'OK'));

    server.get('/connect', controller.connect.bind(controller));
    server.get('/callback', controller.callback.bind(controller));

    server.post('/payhawk', controller.payhawk.bind(controller));

    return server;
};
