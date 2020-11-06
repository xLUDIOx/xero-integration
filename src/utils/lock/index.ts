import { createLogger } from '../logger';
import { Lock } from './Lock';

export * from './ILock';
export * from './Lock';

export const createLock = () => {
    return new Lock(createLogger());
};
