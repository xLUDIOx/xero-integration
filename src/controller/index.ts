import * as restify from 'restify';

import { config } from '../Config';
import { Integration, XeroConnection } from '../managers';
import { createLogger } from '../utils';
import { Controller } from './Controller';

export { Controller };
export const create = () => {
    const callbackHtmlHandler = restify.plugins.serveStatic({
        directory: './assets',
        file: 'callback.html',
    });

    const logger = createLogger(config.serviceName);
    return new Controller(logger, XeroConnection.createManager, Integration.createManager, callbackHtmlHandler);
};
