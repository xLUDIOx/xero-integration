import { It, Mock, Times } from 'typemoq';

import { IDbClient, ITokenSet } from '@shared';
import { ILogger } from '@utils';

import { PgStore } from './PgStore';

describe('Access Tokens store', () => {
    const dbClientMock = Mock.ofType<IDbClient>();
    const loggerMock = Mock.ofType<ILogger>();
    const store = new PgStore(dbClientMock.object, loggerMock.object);

    beforeEach(() => {
        dbClientMock
            .setup(d => d.query(It.isAny()))
            .callback(req => expect(req).toMatchSnapshot())
            .returns(async () => ({ rows: [{ count: 0 }], rowCount: 1 }));

        loggerMock
            .setup(l => l.child(It.isAny()))
            .returns(() => loggerMock.object);

        loggerMock
            .setup(l => l.error(It.isAny()))
            .returns((err: Error) => err);
    });

    afterEach(() => {
        dbClientMock.verifyAll();
        dbClientMock.reset();
        loggerMock.verifyAll();
        loggerMock.reset();
    });

    it('should match snapshot for getting access token for account', async () => {
        await store.getByAccountId('acc_id');
    });

    it('should match snapshot for deleting access token for tenant', async () => {
        await store.delete('tenant_id');
    });

    it('should match snapshot for updating access token for tenant', async () => {
        await store.update('account_id', 'tenant_id', { access_token: 'token' } as ITokenSet);
    });

    it('should match snapshot for updating tenant for account', async () => {
        await store.updateTenant('account_id', 'tenant_id');
    });

    it('should match snapshot for creating access token for account', async () => {
        await store.create({
            account_id: 'acc_id',
            user_id: 'user_id',
            tenant_id: 'tenant_id',
            token_set: { access_token: 'token' } as ITokenSet,
        });
    });

    it('should throw error if there is another active account using same tenant ID', async () => {
        dbClientMock.reset();

        dbClientMock
            .setup(x => x.query(It.isAny()))
            .returns(async () => ({ rows: [{ count: 1 }], rowCount: 1 }))
            .verifiable(Times.once());

        const create = store.create({
            account_id: 'acc_id',
            user_id: 'user_id',
            tenant_id: 'tenant_id',
            token_set: { access_token: 'token' } as ITokenSet,
        });

        await expect(create).rejects.toThrowError('Another active account already uses the same tenant ID');
    });
});
