import { Throttler } from './Throttler';

jest.useFakeTimers();

describe('Throttler', () => {
    const callback = jest.fn();
    callback.mockImplementation(() => Promise.resolve());

    const originalClient = {
        nested: {
            getStuff: callback,
        },
        getStuff: callback,
        getOtherStuff: callback,
    };

    const throttler = new Throttler(10);
    const wrappedClientMock = throttler.getThrottledWrap('acc_id', originalClient);

    test('should delay method invokations if max invokations per minute has been reached', async () => {
        for (let i = 0; i < 30; i++) {
            // tslint:disable-next-line: no-floating-promises
            wrappedClientMock.getStuff();
            wrappedClientMock.getOtherStuff();
            wrappedClientMock.nested.getStuff();
        }

        // initially, expect no method invokations
        expect(callback).toHaveBeenCalledTimes(0);

        // since initially queue was empty expect it to be now full
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(10);

        // since queue is full, if < 1min has passed, expect no new invokations
        jest.advanceTimersByTime(40 * 1000);
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(10);

        // full min has passed, expect queue to be filled with new invokations
        jest.advanceTimersByTime(20 * 1000);
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(20);

        // less than 1 min has passed, expect no new invokations
        jest.advanceTimersByTime(40 * 1000);
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(20);

        // full min has passed, expect queue to be filled with new invokations
        jest.advanceTimersByTime(20 * 1000);
        await flushPromises();
        expect(callback).toHaveBeenCalledTimes(30);
    });
});

function flushPromises() {
    return new Promise(resolve => setImmediate(resolve));
}
