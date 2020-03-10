const TIMEOUT_INTERVAL_MS = 1000;

export class Throttler {
    private readonly ring = new Array<{ [key: string]: number }>(this.size);
    private readonly queues: { [key: string]: (() => any)[] } = {};
    private cursor: number = 0;

    constructor(private readonly maxRequestsPerMinute: number, private readonly size: number = 60) {
        this.ring[this.cursor] = {};
        setInterval(() => this.interval(), TIMEOUT_INTERVAL_MS);
    }

    getThrottledWrap<TClient extends object>(key: string, originalClient: TClient): TClient {
        const that = this;
        const wrapObject = <T extends object>(obj: any): any => {
            return new Proxy<T>(obj, {
                get: (target, propKey, receiver) => {
                    const propertyValue = (target as any)[propKey];
                    if (typeof propertyValue === 'function') {
                        return function(this: T, ...args: any) {
                            const result = that.call(key, () => propertyValue.apply(this, args));
                            return result;
                        };
                    } else {
                        return wrapObject(propertyValue);
                    }
                },
            });
        };

        return wrapObject(originalClient);
    }

    private call<TResult>(key: string, func: () => Promise<TResult>): Promise<TResult> {
        if (!this.queues[key]) {
            this.queues[key] = [];
        }

        const awaiter = new Promise<TResult>((resolve, reject) => {
            const pr = new Promise(r => {
                this.queues[key].push(r);
                this.tryDequeue(key);
            });

            // tslint:disable-next-line: no-floating-promises
            pr.then(() => func().then(resolve).catch(reject));
        });

        return awaiter;
    }

    private async interval() {
        this.cursor = (this.cursor + 1) % this.size;
        this.ring[this.cursor] = {};

        await Promise.all(Object.keys(this.queues).map(k => this.tryDequeue(k)));
    }

    private tryDequeue(key: string) {
        const queue = this.queues[key];
        if (!queue) {
            return;
        }

        let trailingCount = this.getTrailingCount(key);
        while (queue.length > 0 && trailingCount < this.maxRequestsPerMinute) {
            const resolve = queue.shift();
            if (resolve) {
                this.ring[this.cursor][key] = this.ring[this.cursor][key] ? this.ring[this.cursor][key] + 1 : 1;
                resolve();
            }

            trailingCount = this.getTrailingCount(key);
        }
    }

    private getTrailingCount(key: string) {
        let sum = 0;
        this.ring.forEach(r => {
            if (key in r) {
                sum += r[key];
            }
        });

        return sum;
    }
}
