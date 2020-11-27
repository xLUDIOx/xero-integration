import { It, Mock } from 'typemoq';

import { IDbClient } from '@shared';

import { PgStore } from './PgStore';

describe('Expense Transactions store', () => {
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

    it('should match snapshot for creating record', async () => {
        await store.create('acc_id', 'exp_id', 'tx_id');
    });

    it('should match snapshot for getting record', async () => {
        await store.getByAccountId('acc_id', 'exp_id');
    });
});
