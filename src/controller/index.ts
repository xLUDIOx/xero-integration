import * as restify from 'restify';

import { Integration, XeroConnection } from '../managers';
import { Controller } from './Controller';

export { Controller };
export const create = () => {
    const callbackHrmlHandler = restify.plugins.serveStatic({
        directory: './assets',
        file: 'callback.html',
    });

    return new Controller(XeroConnection.createManager, Integration.createManager, callbackHrmlHandler);
};
