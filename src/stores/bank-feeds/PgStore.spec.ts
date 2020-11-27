import { It, Mock } from 'typemoq';

import { EntityType, IDbClient } from '@shared';

import { PgStore } from './PgStore';

describe('Api Keys store', () => {
    const dbClientMock = Mock.ofType<IDbClient>();
    const store = new PgStore(dbClientMock.object);

    beforeEach(() => {
        dbClientMock
            .setup(d => d.query(It.isAny()))
            .callback(req => expect(req).toMatchSnapshot())
            .returns(async () => ({ rows: [{}], rowCount: 1 }));
    });

    afterEach(() => {
        dbClientMock.verifyAll();
        dbClientMock.reset();
    });

    it('should match snapshot for creating feed connection', async () => {
        await store.createConnection({
            account_id: 'acc_id',
            bank_connection_id: 'conn_id',
            currency: 'BGN',
        });
    });

    it('should match snapshot for getting feed connection', async () => {
        await store.getConnectionIdByCurrency('acc_id', 'BGN');
    });

    it('should match snapshot for creating feed statement', async () => {
        await store.createStatement({
            account_id: 'acc_id',
            bank_statement_id: 'statement_id',
            payhawk_entity_id: 'entity_id',
            payhawk_entity_type: EntityType.Expense,
            xero_entity_id: '100',
        });
    });

    it('should match snapshot for getting feed statement', async () => {
        await store.getStatementIdByEntityId({
            account_id: 'acc_id',
            xero_entity_id: 'entity_id',
            payhawk_entity_id: '100',
            payhawk_entity_type: EntityType.Expense,
        });
    });
});
