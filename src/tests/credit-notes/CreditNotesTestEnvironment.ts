import * as TypeMoq from 'typemoq';
import { CreditNote, Payment } from 'xero-node';

import { Payhawk } from '@services';

import { XeroTestEnvironmentBase } from '../contracts';

export class CreditNotesTestEnvironment extends XeroTestEnvironmentBase {
    setupRefundExpenseResponseMock(expenseId: string, patch: Partial<Payhawk.IExpense> = {}): Payhawk.IExpense {
        const expense = getRefundCardExpense({ id: expenseId, ...patch });

        this.payhawkClientMock
            .setup(x => x.getExpense(expenseId))
            .returns(async () => expense)
            .verifiable(TypeMoq.Times.once());

        this.payhawkClientMock
            .setup(x => x.downloadFiles(expense))
            .returns(async () => [])
            .verifiable(TypeMoq.Times.once());

        return expense;
    }

    setupRefundExpenseWithFeesResponseMock(expenseId: string, patch: Partial<Payhawk.IExpense> = {}): Payhawk.IExpense {
        const expense = getRefundCardExpense({ id: expenseId, ...patch });
        expense.transactions[0].fees = {
            fx: 1,
            pos: 1,
        };

        this.payhawkClientMock
            .setup(x => x.getExpense(expenseId))
            .returns(async () => expense)
            .verifiable(TypeMoq.Times.once());

        this.payhawkClientMock
            .setup(x => x.downloadFiles(expense))
            .returns(async () => [])
            .verifiable(TypeMoq.Times.once());

        return expense;
    }

    setupCreditNoteNotFoundResponse(creditNoteNumber: string) {
        this.accountingXeroApiMock
            .setup(x => x.getCreditNote(this.xeroTenantId, creditNoteNumber))
            .returns(async () => ({
                response: {},
                body: {
                    creditNotes: [],
                },
            } as any));
    }

    setupCreateCreditNoteResponse(expectation: (creditNotes?: CreditNote[]) => void = () => {/** */ }) {
        const creditNoteResult = {
            creditNoteID: '1',
        } as CreditNote;

        this.accountingXeroApiMock
            .setup(x => x.createCreditNotes(this.xeroTenantId, TypeMoq.It.is(req => {
                expectation(req.creditNotes);

                return true;
            })))
            .returns(async () => ({
                response: {},
                body: {
                    creditNotes: [creditNoteResult],
                },
            } as any))
            .verifiable(TypeMoq.Times.once());

        return creditNoteResult;
    }

    setupNoCreditNotePayments(creditNoteId: string) {
        this.accountingXeroApiMock
            .setup(x => x.createPayment(this.xeroTenantId, TypeMoq.It.isObjectWith({
                creditNote: {
                    creditNoteID: creditNoteId,
                },
            })))
            .verifiable(TypeMoq.Times.never());
    }

    setupCreateCreditNotePaymentResponse(expectation: (payment: Payment) => void = () => {/** */ }) {
        this.accountingXeroApiMock
            .setup(x => x.createPayment(this.xeroTenantId, TypeMoq.It.is(req => {
                expectation(req);
                return true;
            })))
            .returns(async () => ({
                response: {},
                body: {
                    payments: [{
                        paymentID: '1',
                    }],
                },
            } as any))
            .verifiable(TypeMoq.Times.once());
    }
}

function getRefundCardExpense(patch: Partial<Payhawk.IExpense> = {}): Payhawk.IExpense {
    return {
        id: '3627',
        createdAt: '2021-06-12T10:37:24.382Z',
        category: 'Office & Administrative/Telephone & Internet',
        title: 'www.aircall.io',
        note: 'Aircall expense',
        ownerName: 'Hristo Borisov',
        isPaid: true,
        paymentData: {},
        document: {
            date: '2021-06-12T10:37:24.217Z',
            number: 'INV-01-217176',
            files: [
                {
                    contentType: 'application/pdf',
                    url: 'http://api-local.payhawk.io/files/lpjB4NJD4Gjwb6Nd38PnW2LvEY5KygnYZOEaelXgpzQoxO97rA0ZVkBmqROeqPYV',
                },
            ],
        },
        reconciliation: {
            expenseCurrency: 'USD',
            expenseTaxAmount: 0,
            expenseTotalAmount: -19.8,
            baseCurrency: 'BGN',
            baseTaxAmount: 0,
            baseTotalAmount: -31.9386,
            customFields2: {
                teams: {
                    label: 'Teams',
                    selectedValues: {
                        ceo_staff_35ae61: {
                            label: 'CEO Staff',
                        },
                    },
                },
                project_12cfa0: {
                    label: 'Project',
                    selectedValues: {
                        main_project_c495db: {
                            label: 'Main project',
                        },
                    },
                },
            },
            accountCode: '602241',
        },
        supplier: {
            countryCode: 'FR',
            name: 'Aircall SAS',
            vat: 'FR85807437595',
        },
        transactions: [
            {
                id: '5136',
                cardAmount: -16.00,
                cardCurrency: 'EUR',
                cardName: 'Sales tools',
                cardHolderName: 'Hristo Borisov',
                cardLastDigits: '6109',
                description: 'www.aircall.io \\ 1 888-240-69 FR',
                paidAmount: -19.80,
                paidCurrency: 'USD',
                date: '2021-06-12T10:37:24.217Z',
                settlementDate: '2021-06-12T10:37:24.217Z',
                fees: {
                    fx: 0,
                    pos: 0,
                },
            },
        ],
        taxRate: {
            code: 'NONE',
            name: 'Tax Exempt',
            rate: 0,
        },
        externalLinks: [],
        balancePayments: [],
        recipient: {
            name: 'Aircall SAS',
            vat: 'FR85807437595',
        },
        isReadyForReconciliation: true,
        isLocked: false,
        lineItems: [],
        ...patch,
    };
}
