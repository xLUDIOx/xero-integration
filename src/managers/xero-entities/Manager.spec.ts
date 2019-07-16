import * as TypeMoq from 'typemoq';

import { Payhawk, Xero } from '../../services';
import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { Manager } from './Manager';

const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

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

    describe('getExpenseAccounts', () => {
        test('returns account codes from client', async () => {
            const accountCodes: IAccountCode[] = [
                {
                    Code: '429',
                    Name: 'General Expenses',
                },
                {
                    Code: '300',
                    Name: 'Advertisement',
                },
            ];

            xeroClientMock
                .setup(x => x.getExpenseAccounts())
                .returns(async () => accountCodes);

            const result = await manager.getExpenseAccounts();

            expect(result).toEqual(accountCodes);
        });
    });

    describe('getContactIdForSupplier', () => {
        test('gets contact id based on supplier name and VAT', async () => {
            const contactId = 'contact-id';
            const supplier: Payhawk.ISupplier = {
                name: 'Supplier Inc',
                address: 'London',
                countryCode: 'UK',
                vat: 'UK12331123',
            };

            xeroClientMock
                .setup(x => x.findContact(supplier.name, supplier.vat))
                .returns(async () => ({ ContactID: contactId }));

            const result = await manager.getContactIdForSupplier(supplier);

            expect(result).toEqual(contactId);
        });

        test('creates new contact if not found', async () => {
            const contactId = 'contact-id';
            const supplier: Payhawk.ISupplier = {
                name: 'Supplier Inc',
                address: 'London',
                countryCode: 'UK',
                vat: 'UK12331123',
            };

            xeroClientMock
                .setup(x => x.findContact(supplier.name, supplier.vat))
                .returns(async () => undefined);

            xeroClientMock
                .setup(x => x.createContact(supplier.name, supplier.vat))
                .returns(async () => ({ ContactID: contactId }))
                .verifiable(TypeMoq.Times.once());

            const result = await manager.getContactIdForSupplier(supplier);

            expect(result).toEqual(contactId);
        });

        test('gets default contact id if there is no supplier name', async () => {
            const contactId = 'contact-id';
            const supplier: Payhawk.ISupplier = {
                name: '',
                address: 'London',
                countryCode: 'UK',
                vat: 'UK12331123',
            };

            xeroClientMock
                .setup(x => x.findContact(DEFAULT_SUPPLIER_NAME, supplier.vat))
                .returns(async () => ({ ContactID: contactId }));

            const result = await manager.getContactIdForSupplier(supplier);

            expect(result).toEqual(contactId);
        });

        test('creates default contact if not found', async () => {
            const contactId = 'contact-id';
            const supplier: Payhawk.ISupplier = {
                name: '',
                address: 'London',
                countryCode: 'UK',
                vat: 'UK12331123',
            };

            xeroClientMock
                .setup(x => x.findContact(DEFAULT_SUPPLIER_NAME, supplier.vat))
                .returns(async () => undefined);

            xeroClientMock
                .setup(x => x.createContact(DEFAULT_SUPPLIER_NAME, undefined))
                .returns(async () => ({ ContactID: contactId }))
                .verifiable(TypeMoq.Times.once());

            const result = await manager.getContactIdForSupplier(supplier);

            expect(result).toEqual(contactId);
        });
    });

    describe('getBankAccountIdForCurrency', () => {
        const currency = 'EUR';
        const accountName = 'Payhawk EUR';
        const accountNumber = 'PAYHAWK-EUR';
        const accountCode = 'PHWK-EUR';
        const bankAccountId = 'bank-account-id';

        test('gets existing bank account for currency', async () => {
            xeroClientMock
                .setup(x => x.getBankAccountByCode(accountCode))
                .returns(async () => ({ AccountID: bankAccountId, Name: accountName, Status: 'ACTIVE' }));

            const result = await manager.getBankAccountIdForCurrency(currency);

            expect(result).toEqual(bankAccountId);
        });

        test('gets existing bank account for currency and activates it when archived', async () => {
            const bankAccount: Xero.IBankAccount = { AccountID: bankAccountId, Name: accountName, Status: 'ARCHIVED' };
            xeroClientMock
                .setup(x => x.getBankAccountByCode(accountCode))
                .returns(async () => bankAccount);

            xeroClientMock
                .setup(x => x.activateBankAccount(bankAccount))
                .returns(async () => ({ ...bankAccount, Status: 'ACTIVE' }))
                .verifiable(TypeMoq.Times.once());

            const result = await manager.getBankAccountIdForCurrency(currency);

            expect(result).toEqual(bankAccountId);
        });

        test('creates a bank account if it does not exist', async () => {
            const bankAccount: Xero.IBankAccount = { AccountID: bankAccountId, Name: accountName, Status: 'ACTIVE' };
            xeroClientMock
                .setup(x => x.getBankAccountByCode(accountCode))
                .returns(async () => undefined);

            xeroClientMock
                .setup(x => x.createBankAccount(accountName, accountCode, accountNumber, currency))
                .returns(async () => bankAccount);

            const result = await manager.getBankAccountIdForCurrency(currency);

            expect(result).toEqual(bankAccountId);
        });
    });

    describe('createAccountTransaction', () => {
        test('create account transaction', async () => {
            const newTxId = 'new-tx-id';
            const newAccountTx: INewAccountTransaction = {
                bankAccountId: 'bank-account-id',
                contactId: 'contact-id',
                description: 'expense note',
                reference: 'tx description',
                totalAmount: 12.05,
                accountCode: '310',
                files: [],
            };

            xeroClientMock
                .setup(x => x.createTransaction(newAccountTx.bankAccountId, newAccountTx.contactId, newAccountTx.description!, newAccountTx.reference, newAccountTx.totalAmount, newAccountTx.accountCode!))
                .returns(async () => newTxId)
                .verifiable(TypeMoq.Times.once());

            await manager.createAccountTransaction(newAccountTx);
        });

        test('create account transaction with default description and account code', async () => {
            const newTxId = 'new-tx-id';
            const newAccountTx: INewAccountTransaction = {
                bankAccountId: 'bank-account-id',
                contactId: 'contact-id',
                reference: 'tx description',
                totalAmount: 12.05,
                files: [],
            };

            xeroClientMock
                .setup(x => x.createTransaction(newAccountTx.bankAccountId, newAccountTx.contactId, '(no note)', newAccountTx.reference, newAccountTx.totalAmount, '429'))
                .returns(async () => newTxId)
                .verifiable(TypeMoq.Times.once());

            await manager.createAccountTransaction(newAccountTx);
        });
    });

    describe('createBill', () => {
        test('creates a bill', async () => {
            const newBillId = 'new-bill-id';
            const newBill: INewBill = {
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                files: [],
            };

            xeroClientMock
                .setup(x => x.createBill(newBill.contactId, newBill.description!, newBill.currency, newBill.totalAmount, newBill.accountCode!))
                .returns(async () => newBillId)
                .verifiable(TypeMoq.Times.once());

            await manager.createBill(newBill);
        });

        test('creates a bill with default description and account code', async () => {
            const newBillId = 'new-bill-id';
            const newBill: INewBill = {
                currency: 'EUR',
                contactId: 'contact-id',
                totalAmount: 12.05,
                files: [],
            };

            xeroClientMock
                .setup(x => x.createBill(newBill.contactId, '(no note)', newBill.currency, newBill.totalAmount, '429'))
                .returns(async () => newBillId)
                .verifiable(TypeMoq.Times.once());

            await manager.createBill(newBill);
        });
    });
});
