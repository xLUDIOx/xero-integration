import { create as createController } from './controller';
import * as Store from './managers/xero-connection/store';
import { createServer } from './Server';

// tslint:disable-next-line:no-var-requires
require('source-map-support').install();

(async () => {
    const controller = createController();
    const server = createServer(controller);

    const stop = async () => await server.close();
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    process.on('warning', warning => console.error(warning));

    await Store.initialize();

    server.listen(8080, () => console.log('%s listening at %s', server.name, server.url));
})().catch(err => console.error(err));
