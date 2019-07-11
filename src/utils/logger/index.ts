import * as pino from 'pino';

import { ILogger } from './ILogger';
import { PinoStackDriverLogger } from './PinoStackDriverLogger';

export * from './ILogger';

export const createLogger = (serviceName: string): ILogger => {
    return new PinoStackDriverLogger(serviceName, pino());
};
