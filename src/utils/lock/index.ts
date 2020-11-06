import { ILogger } from '../logger';
import { ILock } from './ILock';
import { Lock } from './Lock';

export * from './ILock';
export * from './Lock';

let lock: ILock;

export const createLock = (logger: ILogger) => {
    if (!lock) {
        lock = new Lock(logger);
    }

    return lock;
};
