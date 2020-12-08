import { It, Mock } from 'typemoq';

import { EntityType, IDbClient } from '@shared';

import { PgStore } from './PgStore';

describe('Bank feeds store', () => {
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

    it('should match snapshot for getting feed connection id for account', async () => {
        await store.getConnectionIdsForAccount('acc_id');
    });

    it('should match snapshot for deleting feed connections for account', async () => {
        await store.deleteConnectionForAccount('acc_id', '1232456');
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
        await store.getStatementByEntityId({
            account_id: 'acc_id',
            xero_entity_id: 'entity_id',
            payhawk_entity_id: '100',
            payhawk_entity_type: EntityType.Expense,
        });
    });

    it('should match snapshot for deleting feed statement', async () => {
        await store.deleteStatementByEntityId({
            bank_statement_id: 'statement_id',
            account_id: 'acc_id',
            xero_entity_id: 'entity_id',
            payhawk_entity_id: '100',
            payhawk_entity_type: EntityType.Expense,
        });
    });
});
