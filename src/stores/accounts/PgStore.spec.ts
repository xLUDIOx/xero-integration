import { It, Mock } from 'typemoq';

import { IDbClient } from '@shared';

import { PgStore } from './PgStore';

describe('Accounts store', () => {
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

    it('should get by account id', async () => {
        await store.get('acc_id');
    });

    it('should insert and handle conflict', async () => {
        await store.create({ account_id: 'acc_id', tenant_id: 't_id', initial_sync_completed: true });
    });
});
