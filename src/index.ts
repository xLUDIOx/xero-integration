import * as restify from 'restify';

import { config } from './Config';
import { create as createController } from './controller';

// tslint:disable-next-line:no-var-requires
require('source-map-support').install();

const SERVICE_NAME = 'Xero Integration';

(async () => {
    console.log(config);
    const server = restify.createServer({ name: SERVICE_NAME });
    const controller = createController();

    server.use(restify.plugins.jsonBodyParser());
    server.use(restify.plugins.queryParser());

    const stop = async () => await server.close();
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('warning', warning => console.error(warning));

    // Endpoint used to check whether the service is up and running
    server.get('/status', (req, res) => res.send(200, 'OK'));

    server.get('/connect', controller.connect.bind(controller));
    server.get('/callback', controller.callback.bind(controller));

    server.post('/payhawk', controller.payhawk.bind(controller));

    server.listen(8080, () => console.log('%s listening at %s', server.name, server.url));
})().catch(err => console.error(err));
