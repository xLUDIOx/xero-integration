import * as TypeMoq from 'typemoq';
import { Account, AccountType, CurrencyCode } from 'xero-node';

import { Xero } from '@services';

import { IManager } from './IManager';
import { Manager } from './Manager';

describe('XeroEntities.Manager', () => {
    let xeroClientMock: TypeMoq.IMock<Xero.IClient>;

    let manager: IManager;

    beforeEach(() => {
        xeroClientMock = TypeMoq.Mock.ofType<Xero.IClient>();

        manager = new Manager(xeroClientMock.object);
    });

    afterEach(() => {
        xeroClientMock.verifyAll();
    });

    describe('getBankAccountIdForCurrency', () => {
        const currency = 'EUR';
        const accountName = 'Payhawk EUR';
        const accountNumber = '000000-PAYHAWK-EUR';
        // cspell:disable-next-line
        const accountCode = 'PHWK-EUR';
        const bankAccountId = 'bank-account-id';

        test('gets existing bank account for currency', async () => {
            xeroClientMock
                .setup(x => x.getBankAccountByCode(accountCode))
                .returns(async () => ({
                    accountID: bankAccountId,
                    code: 'PHWK-EUR',
                    name: accountName,
                    status: Account.StatusEnum.ACTIVE,
                    type: AccountType.BANK,
                    bankAccountNumber: '',
                    currencyCode: CurrencyCode.EUR,
                }));

            const result = await manager.getOrCreateByCurrency(currency);

            expect(result.accountID).toEqual(bankAccountId);
        });

        test('gets existing bank account for currency and activates it when archived', async () => {
            const bankAccount: Xero.IBankAccount = {
                accountID: bankAccountId,
                code: 'PHWK-EUR',
                name: accountName,
                status: Account.StatusEnum.ARCHIVED,
                type: AccountType.BANK,
                bankAccountNumber: '',
                currencyCode: CurrencyCode.EUR,
            };

            xeroClientMock
                .setup(x => x.getBankAccountByCode(accountCode))
                .returns(async () => bankAccount);

            xeroClientMock
                .setup(x => x.activateBankAccount(bankAccount.accountID))
                .returns(async () => ({ ...bankAccount, Status: Xero.BankAccountStatusCode.Active }))
                .verifiable(TypeMoq.Times.once());

            const result = await manager.getOrCreateByCurrency(currency);

            expect(result.accountID).toEqual(bankAccountId);
        });

        test('creates a bank account if it does not exist', async () => {
            const bankAccount: Xero.IBankAccount = {
                accountID: bankAccountId,
                code: 'PHWK-EUR',
                name: accountName,
                status: Account.StatusEnum.ACTIVE,
                type: AccountType.BANK,
                bankAccountNumber: '',
                currencyCode: CurrencyCode.EUR,
            };
            xeroClientMock
                .setup(x => x.getBankAccountByCode(accountCode))
                .returns(async () => undefined);

            xeroClientMock
                .setup(x => x.createBankAccount(accountName, accountCode, accountNumber, currency))
                .returns(async () => bankAccount);

            const result = await manager.getOrCreateByCurrency(currency);

            expect(result.accountID).toEqual(bankAccountId);
        });
    });

});
