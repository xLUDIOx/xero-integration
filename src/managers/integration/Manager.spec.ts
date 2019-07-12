import * as TypeMoq from 'typemoq';

import { Payhawk, Xero } from '../../services';
import * as XeroContacts from '../xero-contacts';
import { Manager } from './Manager';

describe('integrations/Manager', () => {
    let xeroClientMock: TypeMoq.IMock<Xero.IClient>;
    let payhawkClientMock: TypeMoq.IMock<Payhawk.IClient>;
    let xeroContactsMock: TypeMoq.IMock<XeroContacts.IManager>;

    let manager: Manager;

    beforeEach(() => {
        xeroClientMock = TypeMoq.Mock.ofType<Xero.IClient>();
        payhawkClientMock = TypeMoq.Mock.ofType<Payhawk.IClient>();
        xeroContactsMock = TypeMoq.Mock.ofType<XeroContacts.IManager>();

        manager = new Manager(xeroClientMock.object, payhawkClientMock.object, xeroContactsMock.object);
    });

    afterEach(() => {
        xeroClientMock.verifyAll();
        payhawkClientMock.verifyAll();
        xeroContactsMock.verifyAll();
    });

    describe('synchronizeChartOfAccounts', () => {
        test('gets expense accounts from xero and puts them on payhawk', async () => {
            const xeroAccounts: Xero.IAccountCode[] = [
                {
                    Name: 'Account 1',
                    Code: '400',
                },
                {
                    Name: 'Account 2',
                    Code: '370',
                },
            ];

            const payhawkAccounts: Payhawk.IAccountCode[] = [
                {
                    name: 'Account 1',
                    code: '400',
                },
                {
                    name: 'Account 2',
                    code: '370',
                },
            ];

            xeroClientMock
                .setup(x => x.getExpenseAccounts())
                .returns(async () => xeroAccounts);

            payhawkClientMock
                .setup(p => p.synchronizeChartOfAccounts(payhawkAccounts))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            await manager.synchronizeChartOfAccounts();
        });
    });
});
