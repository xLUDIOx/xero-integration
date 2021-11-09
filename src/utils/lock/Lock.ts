import { EventEmitter } from 'events';

import { ILogger } from '../logger';
import { ILock } from './ILock';

const MAX_LISTENERS = 20;

export class Lock implements ILock {
    private isLocked: boolean = false;
    private emitter = new EventEmitter();

    constructor(private readonly logger: ILogger) {
        this.emitter.setMaxListeners(MAX_LISTENERS);
    }

    async acquire(): Promise<void> {
        return new Promise(resolve => {
            if (!this.isLocked) {
                this.isLocked = true;

                this.logger.info('Lock acquired');

                return resolve();
            }

            this.logger.info('Waiting for lock to be released [initial]');

            const tryAcquire = () => {
                if (!this.isLocked) {
                    this.isLocked = true;
                    this.emitter.removeListener('release', tryAcquire);

                    this.logger.info('Lock acquired');

                    return resolve();
                }

                this.logger.info('Waiting for lock to be released [retry]');
            };

            this.emitter.on('release', tryAcquire);
        });
    }

    async release(): Promise<void> {
        this.isLocked = false;
        setImmediate(() => this.emitter.emit('release'));

        this.logger.info('Lock released');
    }
}
