import * as restify from 'restify';

import { Controller } from './Controller';
import { managerFactory } from './manager';

export { Controller };
export const create = () => {
    const callbackHrmlHandler = restify.plugins.serveStatic({
        directory: './assets',
        file: 'callback.html',
    });

    return new Controller(managerFactory, callbackHrmlHandler);
};
