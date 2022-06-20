// tslint:disable-next-line: no-var-requires
require('module-alias').addAliases({
    '@web-api': `${__dirname}/web-api`,
    '@environment': `${__dirname}/environment`,
    '@managers': `${__dirname}/managers`,
    '@services': `${__dirname}/services`,
    '@shared': `${__dirname}/shared`,
    '@stores': `${__dirname}/stores`,
    '@utils': `${__dirname}/utils`,
    '@test-utils': `${__dirname}/test-utils`,
});

import * as Schema from '@stores';

import { createServer } from './Server';
import * as Controllers from './web-api';

// tslint:disable-next-line:no-var-requires
require('source-map-support').install();

(async () => {
    await Schema.initialize();

    const authController = Controllers.createAuth();
    const integrationsController = Controllers.createIntegrations();
    const server = createServer(authController, integrationsController);

    server.post('/migrate', async (req, res) => {
        await Schema.ensureVersion();
        res.send(200);
    });

    const stop = async () => await server.close();
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('warning', warning => console.error(warning));

    server.listen(8080, () => console.log('%s listening at %s', server.name, server.url));
})().catch(err => console.error(err));
