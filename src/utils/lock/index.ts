import { createLogger } from '../logger';
import { ILock } from './ILock';
import { Lock } from './Lock';

export * from './ILock';
export * from './Lock';

let lock: ILock;

export const createLock = () => {
    if (!lock) {
        lock = new Lock(createLogger());
    }

    return lock;
};
