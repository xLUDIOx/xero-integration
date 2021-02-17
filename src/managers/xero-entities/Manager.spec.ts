import * as TypeMoq from 'typemoq';

import { Payhawk, Xero } from '@services';
import { AccountStatus, DEFAULT_ACCOUNT_CODE, DEFAULT_ACCOUNT_NAME, FEES_ACCOUNT_CODE, FEES_ACCOUNT_NAME, TaxRateStatus, TaxType } from '@shared';
import { ILogger } from '@utils';

import { IAccountCode } from './IAccountCode';
import { IManager } from './IManager';
import { INewAccountTransaction } from './INewAccountTransaction';
import { INewBill } from './INewBill';
import { Manager } from './Manager';

const DEFAULT_SUPPLIER_NAME = 'Payhawk Transaction';

describe('XeroEntities.Manager', () => {
    let accountingClientMock: TypeMoq.IMock<Xero.AccountingClient.IClient>;
    let xeroClientMock: TypeMoq.IMock<Xero.IClient>;
    let loggerMock: TypeMoq.IMock<ILogger>;

    let manager: IManager;

    const files: (Payhawk.IDownloadedFile & { name: string })[] = [
        {
            contentType: 'image/jpeg',
            fileName: 'file.jpg',
            path: 'tmp/123.file.jpg',
            name: 'file.jpg',
        },
        {
            contentType: 'image/png',
            fileName: 'file.png',
            path: 'tmp/456.file.png',
            name: 'file.png',
        },
    ];

    beforeEach(() => {
        xeroClientMock = TypeMoq.Mock.ofType<Xero.IClient>();
        accountingClientMock = TypeMoq.Mock.ofType<Xero.AccountingClient.IClient>();
        loggerMock = TypeMoq.Mock.ofType<ILogger>();

        loggerMock
            .setup(l => l.child(TypeMoq.It.isAny()))
            .returns(() => loggerMock.object);

        manager = new Manager(xeroClientMock.object, loggerMock.object);

        const accountCodes: IAccountCode[] = [
            {
                accountId: '1',
                code: DEFAULT_ACCOUNT_CODE,
                name: DEFAULT_ACCOUNT_NAME,
                status: AccountStatus.Active,
                taxType: TaxType.TaxOnPurchases,
                addToWatchlist: false,
            },
            {
                accountId: '2',
                code: FEES_ACCOUNT_CODE,
                name: FEES_ACCOUNT_NAME,
                status: AccountStatus.Active,
                taxType: TaxType.None,
                addToWatchlist: false,
            },
        ];

        accountingClientMock
            .setup(a => a.getOrCreateExpenseAccount({
                code: accountCodes[0].code,
                name: accountCodes[0].name,
                addToWatchlist: true,
            }))
            .returns(async () => accountCodes[0]);

        accountingClientMock
            .setup(a => a.getOrCreateExpenseAccount({
                code: accountCodes[1].code,
                name: accountCodes[1].name,
                addToWatchlist: true,
                taxType: accountCodes[1].taxType,
            }))
            .returns(async () => accountCodes[1]);

        accountingClientMock
            .setup(x => x.getTaxRates())
            .returns(async () => [{
                name: TaxType.None,
                effectiveRate: '0',
                status: TaxRateStatus.Active,
                taxType: TaxType.None,
            }]);

        xeroClientMock
            .setup(x => x.accounting)
            .returns(() => accountingClientMock.object);
    });

    afterEach(() => {
        xeroClientMock.verifyAll();
    });

    describe('getExpenseAccounts', () => {
        test('returns account codes from client', async () => {
            const accountCodes: IAccountCode[] = [
                {
                    accountId: '1',
                    code: '429',
                    name: 'General Expenses',
                    status: AccountStatus.Active,
                    taxType: TaxType.TaxOnPurchases,
                    addToWatchlist: false,
                },
                {
                    accountId: '2',
                    code: '300',
                    name: 'Advertisement',
                    status: AccountStatus.Active,
                    taxType: TaxType.TaxOnPurchases,
                    addToWatchlist: false,
                },
            ];

            accountingClientMock
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
                .returns(async () => ({ contactID: contactId }));

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
                .setup(x => x.getOrCreateContact(supplier.name, supplier.vat))
                .returns(async () => ({ contactID: contactId }))
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
                .returns(async () => ({ contactID: contactId }));

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
                .setup(x => x.getOrCreateContact(DEFAULT_SUPPLIER_NAME, undefined))
                .returns(async () => ({ contactID: contactId }))
                .verifiable(TypeMoq.Times.once());

            const result = await manager.getContactIdForSupplier(supplier);

            expect(result).toEqual(contactId);
        });
    });

    describe('createAccountTransaction', () => {
        test('updates account transaction and does not upload any files if they are the same', async () => {
            const newAccountTx: INewAccountTransaction = {
                date: new Date(2012, 10, 10).toISOString(),
                bankAccountId: 'bank-account-id',
                contactId: 'contact-id',
                description: 'expense note',
                reference: 'tx description',
                amount: 12.05,
                fxFees: 1,
                posFees: 2,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
            };

            const id = 'tr';

            xeroClientMock
                .setup(x => x.getTransactionByUrl(newAccountTx.url))
                .returns(async () => ({ bankTransactionID: id, isReconciled: false } as Xero.IBankTransaction));

            xeroClientMock
                .setup(x => x.createTransaction(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateTransaction({
                    transactionId: id,
                    date: newAccountTx.date,
                    bankAccountId: newAccountTx.bankAccountId,
                    contactId: newAccountTx.contactId,
                    description: newAccountTx.description!,
                    reference: newAccountTx.reference,
                    amount: newAccountTx.amount,
                    fxFees: newAccountTx.fxFees,
                    posFees: newAccountTx.posFees,
                    feesAccountCode: FEES_ACCOUNT_CODE,
                    accountCode: newAccountTx.accountCode!,
                    taxType: newAccountTx.taxType,
                    url: newAccountTx.url,
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.updateTransaction(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getTransactionAttachments(id))
                .returns(async () => files.map(f => {
                    const att = {
                        fileName: f.name,
                    };

                    return att as Xero.IAttachment;
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getTransactionAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            await manager.createOrUpdateAccountTransaction(newAccountTx);
        });

        test('updates account transaction uploads missing files', async () => {
            const newAccountTx: INewAccountTransaction = {
                date: new Date(2012, 10, 10).toISOString(),
                bankAccountId: 'bank-account-id',
                contactId: 'contact-id',
                description: 'expense note',
                reference: 'tx description',
                amount: 12.05,
                fxFees: 1,
                posFees: 2,
                accountCode: '310',
                files,
                url: 'expense url',
            };

            const id = 'tr';

            xeroClientMock
                .setup(x => x.getTransactionByUrl(newAccountTx.url))
                .returns(async () => ({ bankTransactionID: id, isReconciled: false } as Xero.IBankTransaction));

            xeroClientMock
                .setup(x => x.createTransaction(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateTransaction({
                    transactionId: id,
                    date: newAccountTx.date,
                    bankAccountId: newAccountTx.bankAccountId,
                    contactId: newAccountTx.contactId,
                    description: newAccountTx.description!,
                    reference: newAccountTx.reference,
                    amount: newAccountTx.amount,
                    fxFees: newAccountTx.fxFees,
                    posFees: newAccountTx.posFees,
                    feesAccountCode: FEES_ACCOUNT_CODE,
                    accountCode: newAccountTx.accountCode!,
                    taxType: undefined,
                    url: newAccountTx.url,
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.updateTransaction(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getTransactionAttachments(id))
                .returns(async () => [files[0]].map(f => {
                    const att = {
                        fileName: f.name,
                    };

                    return att as Xero.IAttachment;
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getTransactionAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            const missingFile = files[1];

            xeroClientMock
                .setup(x => x.uploadTransactionAttachment(
                    id,
                    missingFile.name,
                    missingFile.path,
                    missingFile.contentType,
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.uploadTransactionAttachment(
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            await manager.createOrUpdateAccountTransaction(newAccountTx);
        });

        test('create account transaction', async () => {
            const newTxId = 'new-tx-id';
            const newAccountTx: INewAccountTransaction = {
                date: new Date(2012, 10, 10).toISOString(),
                bankAccountId: 'bank-account-id',
                contactId: 'contact-id',
                description: 'expense note',
                reference: 'tx description',
                amount: 12.05,
                fxFees: 1,
                posFees: 2,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
            };

            xeroClientMock
                .setup(x => x.createTransaction({
                    date: newAccountTx.date,
                    bankAccountId: newAccountTx.bankAccountId,
                    contactId: newAccountTx.contactId,
                    description: newAccountTx.description!,
                    reference: newAccountTx.reference,
                    amount: newAccountTx.amount,
                    fxFees: newAccountTx.fxFees,
                    posFees: newAccountTx.posFees,
                    feesAccountCode: FEES_ACCOUNT_CODE,
                    accountCode: newAccountTx.accountCode!,
                    taxType: newAccountTx.taxType,
                    url: newAccountTx.url,
                }))
                .returns(async () => newTxId)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createTransaction(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            for (const file of files) {
                const fileName = file.name;
                xeroClientMock
                    .setup(x => x.uploadTransactionAttachment(newTxId, fileName, file.path, file.contentType))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());
            }

            xeroClientMock
                .setup(x => x.uploadTransactionAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(files.length));

            await manager.createOrUpdateAccountTransaction(newAccountTx);
        });

        test('create account transaction with default description and account code', async () => {
            const newTxId = 'new-tx-id';
            const newAccountTx: INewAccountTransaction = {
                date: new Date(2012, 10, 10).toISOString(),
                bankAccountId: 'bank-account-id',
                contactId: 'contact-id',
                reference: 'tx description',
                amount: 12.05,
                fxFees: 1,
                posFees: 2,
                files,
                url: 'expense url',
            };

            xeroClientMock
                .setup(x => x.createTransaction({
                    date: newAccountTx.date,
                    bankAccountId: newAccountTx.bankAccountId,
                    contactId: newAccountTx.contactId,
                    description: '(no note)',
                    reference: newAccountTx.reference,
                    amount: newAccountTx.amount,
                    fxFees: newAccountTx.fxFees,
                    posFees: newAccountTx.posFees,
                    feesAccountCode: FEES_ACCOUNT_CODE,
                    accountCode: DEFAULT_ACCOUNT_CODE,
                    taxType: undefined,
                    url: newAccountTx.url,
                }))
                .returns(async () => newTxId)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createTransaction(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            for (const file of files) {
                const fileName = file.name;
                xeroClientMock
                    .setup(x => x.uploadTransactionAttachment(newTxId, fileName, file.path, file.contentType))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());
            }

            xeroClientMock
                .setup(x => x.uploadTransactionAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(files.length));

            await manager.createOrUpdateAccountTransaction(newAccountTx);
        });
    });

    describe('createBill', () => {
        test('updates bill and does not upload any files if they are the same', async () => {
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 10).toISOString(),
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
            };

            const id = 'bId';

            const existingBill = { invoiceID: id, status: Xero.InvoiceStatus.DRAFT } as Xero.IInvoice;

            xeroClientMock
                .setup(x => x.getBillByUrl(newBill.url))
                .returns(async () => existingBill)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillByUrl(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateBill({
                    billId: id,
                    date: newBill.date,
                    dueDate: newBill.date,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: newBill.description!,
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: newBill.accountCode!,
                    taxType: newBill.taxType,
                    url: newBill.url,
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.updateBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillAttachments(id))
                .returns(async () => files.map(f => {
                    const att = {
                        fileName: f.name,
                    };

                    return att as Xero.IAttachment;
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            await manager.createOrUpdateBill(newBill);
        });

        test('does not update bill and does not upload any files if is it paid', async () => {
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 10).toISOString(),
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
            };

            const id = 'bId';

            const existingBill = { invoiceID: id, status: Xero.InvoiceStatus.PAID } as Xero.IInvoice;

            xeroClientMock
                .setup(x => x.getBillByUrl(newBill.url))
                .returns(async () => existingBill)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillByUrl(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateBill(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.getBillAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            await manager.createOrUpdateBill(newBill);
        });

        test('does not update bill and does not upload any files if is it awaiting payment', async () => {
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 10).toISOString(),
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
                isPaid: false,
            };

            const id = 'bId';

            const existingBill = { invoiceID: id, status: Xero.InvoiceStatus.AUTHORISED } as Xero.IInvoice;

            xeroClientMock
                .setup(x => x.getBillByUrl(newBill.url))
                .returns(async () => existingBill)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillByUrl(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateBill(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.getBillAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            await manager.createOrUpdateBill(newBill);
        });

        test('updates bill and pays it', async () => {
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 12).toISOString(),
                isPaid: true,
                paymentDate: new Date(2012, 10, 11).toISOString(),
                bankAccountId: 'bank_id',
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
            };

            const id = 'bId';

            const existingBill = { invoiceID: id, status: Xero.InvoiceStatus.DRAFT } as Xero.IInvoice;

            xeroClientMock
                .setup(x => x.getBillByUrl(newBill.url))
                .returns(async () => existingBill)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillByUrl(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateBill({
                    billId: id,
                    date: newBill.date,
                    dueDate: newBill.dueDate,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: newBill.description!,
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: newBill.accountCode!,
                    taxType: newBill.taxType,
                    url: newBill.url,
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.updateBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillAttachments(id))
                .returns(async () => files.map(f => {
                    const att = {
                        fileName: f.name,
                    };

                    return att as Xero.IAttachment;
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.payBill({
                    billId: id,
                    amount: newBill.totalAmount,
                    fxRate: newBill.fxRate,
                    bankAccountId: newBill.bankAccountId!,
                    date: newBill.paymentDate!,
                    currency: newBill.currency,
                }))
                .verifiable(TypeMoq.Times.once());

            await manager.createOrUpdateBill(newBill);
        });

        test('updates bill and uploads missing files', async () => {
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 10).toISOString(),
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                files,
                url: 'expense url',
            };

            const id = 'bId';

            const existingBill = { invoiceID: id, status: Xero.InvoiceStatus.DRAFT } as Xero.IInvoice;

            xeroClientMock
                .setup(x => x.getBillByUrl(newBill.url))
                .returns(async () => existingBill)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillByUrl(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.never());

            xeroClientMock
                .setup(x => x.updateBill({
                    billId: id,
                    date: newBill.date,
                    dueDate: newBill.date,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: newBill.description!,
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: newBill.accountCode!,
                    taxType: undefined,
                    url: newBill.url,
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.updateBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillAttachments(id))
                .returns(async () => [files[0]].map(f => {
                    const att = {
                        fileName: f.name,
                    };

                    return att as Xero.IAttachment;
                }))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.getBillAttachments(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.once());

            const missingFile = files[1];

            xeroClientMock
                .setup(x => x.uploadBillAttachment(
                    id,
                    missingFile.name,
                    missingFile.path,
                    missingFile.contentType,
                ))
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.uploadBillAttachment(
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            await manager.createOrUpdateBill(newBill);
        });

        test('creates a bill', async () => {
            const newBillId = 'new-bill-id';
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 10).toISOString(),
                currency: 'EUR',
                fxRate: 1,
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                taxType: 'TAX001',
                files,
                url: 'expense url',
            };

            xeroClientMock
                .setup(x => x.createBill({
                    date: newBill.date,
                    dueDate: newBill.date,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: newBill.description!,
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: newBill.accountCode!,
                    taxType: newBill.taxType,
                    url: newBill.url,
                }))
                .returns(async () => newBillId)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            for (const file of files) {
                const fileName = file.name;
                xeroClientMock
                    .setup(x => x.uploadBillAttachment(newBillId, fileName, file.path, file.contentType))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());
            }

            xeroClientMock
                .setup(x => x.uploadBillAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(files.length));

            await manager.createOrUpdateBill(newBill);
        });

        test('creates a bill and pays it', async () => {
            const newBillId = 'new-bill-id';
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 12).toISOString(),
                paymentDate: new Date(2012, 10, 11).toISOString(),
                isPaid: true,
                bankAccountId: 'bank_id',
                currency: 'EUR',
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                files,
                url: 'expense url',
            };

            xeroClientMock
                .setup(x => x.createBill({
                    date: newBill.date,
                    dueDate: newBill.dueDate,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: newBill.description!,
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: newBill.accountCode!,
                    taxType: undefined,
                    url: newBill.url,
                }))
                .returns(async () => newBillId)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            for (const file of files) {
                const fileName = file.name;
                xeroClientMock
                    .setup(x => x.uploadBillAttachment(newBillId, fileName, file.path, file.contentType))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());
            }

            xeroClientMock
                .setup(x => x.uploadBillAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(files.length));

            xeroClientMock
                .setup(x => x.payBill({
                    billId: newBillId,
                    amount: newBill.totalAmount,
                    fxRate: newBill.fxRate,
                    bankAccountId: newBill.bankAccountId!,
                    date: newBill.paymentDate!,
                    currency: newBill.currency,
                }))
                .verifiable(TypeMoq.Times.once());

            await manager.createOrUpdateBill(newBill);
        });

        test('creates a bill and does not pay it if there is no bank account id', async () => {
            const newBillId = 'new-bill-id';
            const newBill: INewBill = {
                date: new Date(2012, 10, 10).toISOString(),
                dueDate: new Date(2012, 10, 10).toISOString(),
                isPaid: true,
                currency: 'EUR',
                fxRate: 1,
                contactId: 'contact-id',
                description: 'expense note',
                totalAmount: 12.05,
                accountCode: '310',
                files,
                url: 'expense url',
            };

            xeroClientMock
                .setup(x => x.createBill({
                    date: newBill.date,
                    dueDate: newBill.date,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: newBill.description!,
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: newBill.accountCode!,
                    url: newBill.url,
                    taxType: undefined,
                }))
                .returns(async () => newBillId)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            for (const file of files) {
                const fileName = file.name;
                xeroClientMock
                    .setup(x => x.uploadBillAttachment(newBillId, fileName, file.path, file.contentType))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());
            }

            xeroClientMock
                .setup(x => x.uploadBillAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(files.length));

            xeroClientMock
                .setup(x => x.payBill(TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.never());

            await manager.createOrUpdateBill(newBill);
        });

        test('creates a bill with default description and account code', async () => {
            const newBillId = 'new-bill-id';
            const newBill: INewBill = {
                date: new Date(2012, 1, 1).toISOString(),
                dueDate: new Date(2012, 1, 11).toISOString(),
                currency: 'EUR',
                fxRate: 1,
                contactId: 'contact-id',
                totalAmount: 12.05,
                files,
                url: 'expense url',
            };

            xeroClientMock
                .setup(x => x.createBill({
                    date: newBill.date,
                    dueDate: newBill.dueDate,
                    isPaid: newBill.isPaid,
                    contactId: newBill.contactId,
                    description: '(no note)',
                    currency: newBill.currency,
                    fxRate: newBill.fxRate,
                    amount: newBill.totalAmount,
                    accountCode: DEFAULT_ACCOUNT_CODE,
                    taxType: undefined,
                    url: newBill.url,
                }))
                .returns(async () => newBillId)
                .verifiable(TypeMoq.Times.once());

            xeroClientMock
                .setup(x => x.createBill(
                    TypeMoq.It.isAny(),
                ))
                .verifiable(TypeMoq.Times.once());

            for (const file of files) {
                const fileName = file.name;
                xeroClientMock
                    .setup(x => x.uploadBillAttachment(newBillId, fileName, file.path, file.contentType))
                    .returns(() => Promise.resolve())
                    .verifiable(TypeMoq.Times.once());
            }

            xeroClientMock
                .setup(x => x.uploadBillAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .verifiable(TypeMoq.Times.exactly(files.length));

            await manager.createOrUpdateBill(newBill);
        });

        describe('creates a bill with fallback to default account code', () => {
            [
                'Account code \'42945235343232\' is not a valid code for this document.',
                'Account code \'42945235343232\' has been archived, or has been deleted. Each line item must reference a valid account.',
            ].forEach(errorMsg => {
                test(errorMsg, async () => {
                    const newBillId = 'new-bill-id';
                    const newBill: INewBill = {
                        date: new Date(2012, 1, 1).toISOString(),
                        dueDate: new Date(2012, 1, 1).toISOString(),
                        currency: 'EUR',
                        fxRate: 1,
                        contactId: 'contact-id',
                        totalAmount: 12.05,
                        files,
                        url: 'expense url',
                        accountCode: '42945235343232',
                    };

                    xeroClientMock
                        .setup(x => x.createBill({
                            date: newBill.date,
                            dueDate: newBill.date,
                            isPaid: newBill.isPaid,
                            contactId: newBill.contactId,
                            description: '(no note)',
                            currency: newBill.currency,
                            amount: newBill.totalAmount,
                            fxRate: newBill.fxRate,
                            accountCode: newBill.accountCode!,
                            taxType: undefined,
                            url: newBill.url,
                        }))
                        .throws(Error(`
                        [
                            {
                                "Message": "${errorMsg}"
                            }
                        ]
                    `))
                        .verifiable(TypeMoq.Times.exactly(2));

                    accountingClientMock
                        .setup(x => x.getTaxRates())
                        .returns(async () => [{
                            name: 'Tax Exempt',
                            effectiveRate: '20',
                            taxType: TaxType.None,
                            status: TaxRateStatus.Active,
                        }]);

                    accountingClientMock
                        .setup(x => x.getOrCreateExpenseAccount({
                            name: DEFAULT_ACCOUNT_NAME,
                            code: DEFAULT_ACCOUNT_CODE,
                            addToWatchlist: true,
                        }))
                        .returns(async () => ({
                            accountId: '1',
                            code: DEFAULT_ACCOUNT_CODE,
                            name: DEFAULT_ACCOUNT_NAME,
                            status: AccountStatus.Active,
                            taxType: TaxType.TaxOnPurchases,
                            addToWatchlist: false,
                        }));

                    accountingClientMock
                        .setup(x => x.getOrCreateExpenseAccount({
                            name: FEES_ACCOUNT_NAME,
                            code: FEES_ACCOUNT_CODE,
                            taxType: TaxType.None,
                            addToWatchlist: true,
                        }))
                        .returns(async () => ({
                            accountId: '1',
                            code: FEES_ACCOUNT_NAME,
                            name: FEES_ACCOUNT_CODE,
                            status: AccountStatus.Active,
                            taxType: TaxType.None,
                            addToWatchlist: false,
                        }));

                    xeroClientMock
                        .setup(x => x.createBill({
                            date: newBill.date,
                            dueDate: newBill.date,
                            isPaid: newBill.isPaid,
                            contactId: newBill.contactId,
                            description: '(no note)',
                            currency: newBill.currency,
                            amount: newBill.totalAmount,
                            fxRate: newBill.fxRate,
                            accountCode: DEFAULT_ACCOUNT_CODE,
                            taxType: undefined,
                            url: newBill.url,
                        }))
                        .returns(async () => newBillId)
                        .verifiable(TypeMoq.Times.exactly(2));

                    for (const file of files) {
                        const fileName = file.name;
                        xeroClientMock
                            .setup(x => x.uploadBillAttachment(newBillId, fileName, file.path, file.contentType))
                            .returns(() => Promise.resolve())
                            .verifiable(TypeMoq.Times.exactly(2));
                    }

                    xeroClientMock
                        .setup(x => x.uploadBillAttachment(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                        .verifiable(TypeMoq.Times.exactly(files.length * 2));

                    // test 2 consecutive failures
                    await manager.createOrUpdateBill(newBill);
                    await manager.createOrUpdateBill(newBill);
                });
            });
        });
    });
});
