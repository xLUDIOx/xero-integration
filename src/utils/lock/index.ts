import { createLogger } from '../logger';
import { Lock } from './Lock';

export * from './ILock';
export * from './Lock';

const locksMap = new Map<string, Lock>();

export const createLock = (key: string) => {
    let lock = locksMap.get(key);
    if (!lock) {
        lock = new Lock(createLogger());
        locksMap.set(key, lock);
    }

    return lock;
};
