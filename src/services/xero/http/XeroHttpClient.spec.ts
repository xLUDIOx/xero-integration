import { Mock } from 'typemoq';
import { XeroClient } from 'xero-node';

import { ILogger, Lock } from '@utils';

import { XeroHttpClient } from './XeroHttpClient';

describe('Xero HTTP client', () => {
    const xeroMock = Mock.ofType<XeroClient>();
    const loggerMock = Mock.ofType<ILogger>();

    const client = new XeroHttpClient(xeroMock.object, new Lock(loggerMock.object), loggerMock.object);

    afterEach(() => {
        [
            xeroMock,
            loggerMock,
        ].forEach(m => {
            m.verifyAll();
            m.reset();
        });
    });

    it('should not allow concurrent requests', async () => {
        const result: number[] = [];

        // make 10 concurrent requests each resolving after a different time
        // if concurrency is not allowed
        // result should contain numbers in sequence, not randomized
        await Promise.all(new Array(10).fill(0).map((_, i) =>
            client.makeClientRequest(async () => {
                await new Promise((res, rej) => {
                    setTimeout(
                        () => {
                            result.push(i);
                            res();
                        },
                        Math.random() * 100,
                    );
                });
            })));

        expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
});
