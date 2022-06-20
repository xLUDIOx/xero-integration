import { It, Mock } from 'typemoq';

import { IDbClient } from '../db-client';
import { PgStore } from './PgStore';

describe('Api Keys store', () => {
    const dbClientMock = Mock.ofType<IDbClient>();
    const store = new PgStore(dbClientMock.object);

    beforeEach(() => {
        dbClientMock
            .setup(d => d.query(It.isAny()))
            .callback(req => expect(req).toMatchSnapshot())
            .returns(async () => ({ rows: [], rowCount: 0 }));
    });

    afterEach(() => {
        dbClientMock.verifyAll();
        dbClientMock.reset();
    });

    it('should match snapshot for getting api key for account', async () => {
        await store.getByAccountId('acc_id');
    });

    it('should match snapshot for setting api key for account', async () => {
        await store.set({ account_id: 'acc_id', key: 'api-key' });
    });
});
