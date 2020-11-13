import * as pino from 'pino';

import { config } from '../../Config';
import { ILogger } from './ILogger';
import { PinoStackDriverLogger } from './PinoStackDriverLogger';

export * from './ILogger';
export * from './LoggedError';

let logger: ILogger;

const prettyPrint = process.env.LOG_PRETTY === 'true';
const level = process.env.LOG_LEVEL || 'info';

export const createLogger = (): ILogger => {
    if (!logger) {
        logger = new PinoStackDriverLogger(config.serviceName, pino({ level, prettyPrint }));
    }

    return logger;
};
