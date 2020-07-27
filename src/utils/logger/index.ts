import * as pino from 'pino';

import { config } from '../../Config';
import { ILogger } from './ILogger';
import { PinoStackDriverLogger } from './PinoStackDriverLogger';

export * from './ILogger';

let logger: ILogger;

export const createLogger = (): ILogger => {
    if (!logger) {
        logger = new PinoStackDriverLogger(config.serviceName, pino());
    }

    return logger;
};
