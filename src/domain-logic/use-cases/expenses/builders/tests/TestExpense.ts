import { Payhawk } from '@payhawk/external-integration-service-contracts';

import {
    IValidatedExpense,
    IValidatedLineItem,
    IValidatedReconciliation,
} from '../../validation';

export class TestExpense {
    private readonly expense: IValidatedExpense;

    constructor(patch: Partial<IValidatedExpense> = {}) {
        this.expense = createExpense(patch);
    }

    withReconciliation(patch: Partial<IValidatedReconciliation> = {}) {
        this.expense.reconciliation = {
            ...this.expense.reconciliation,
            ...(patch || {}),
        };

        return this;
    }

    withLineItem(patch: Partial<IValidatedLineItem>) {
        this.expense.lineItems = this.expense.lineItems || [];
        this.expense.lineItems.push({
            category: 'Marketing',
            categoryId: '123',
            id: (this.expense.lineItems.length + 1).toString(),
            reconciliation: {
                ...this.expense.reconciliation,
                ...(patch.reconciliation ?? {}),
            },
            taxRate: {
                code: 'TAX003',
                name: 'VAT on Purchases',
                rate: 12,
                ...(patch.taxRate ?? {}),
            },
            ...patch,
        });

        this.expense.reconciliation = {
            ...this.expense.reconciliation,
            accountCode: undefined,
            customFields2: undefined,
        };

        return this;
    }

    withCardTransaction(patch: Partial<Payhawk.IExpensePayment> = {}) {
        this.expense.payments.push({
            id: '4970',
            type: Payhawk.ExpensePaymentType.CardTransaction,
            status: Payhawk.ExpensePaymentStatus.Settled,
            balanceId: '4',
            amount: 743.4,
            currency: 'EUR',
            description: 'LUFTHANSA AG2202461575610 \\ LALA DE',
            originalAmount: 743.4,
            originalCurrency: 'EUR',
            date: new Date('2021-06-01T06:36:56.565Z'),
            fees: {
                fx: 0,
                pos: 0,
                bank: 0,
            },
            fxRate: 1,
            expenseIds: [this.expense.id],

            ...(patch || {}),
        });

        return this;
    }

    withBankPayment(patch: Partial<Payhawk.IExpensePayment> = {}) {
        this.expense.payments.push({
            amount: 743.4,
            currency: 'EUR',
            date: new Date('2021-06-01T06:36:56.565Z'),
            fees: {
                bank: 0,
                fx: 0,
                pos: 0,
            },
            id: '1',
            status: Payhawk.ExpensePaymentStatus.Settled,
            balanceId: '1',
            description: 'Bank transfer',
            expenseIds: [this.expense.id],
            fxRate: 1,
            originalAmount: 743.4,
            originalCurrency: 'EUR',
            type: Payhawk.ExpensePaymentType.BankPayment,

            ...patch,
        });

        return this;
    }

    build(): IValidatedExpense {
        return this.expense;
    }
}
function createExpense(patch: Partial<IValidatedExpense> = {}): IValidatedExpense {
    return {
        id: '3506',
        owner: {
            id: '1',
            email: 'john@smith.com',
            fullName: 'John Smith',
            externalId: '2',
        },
        createdAt: new Date('2021-05-31T11:07:10.709Z'),
        title: 'LUFTHANSA AG2202461575610',
        note: 'Flights for John, Tom and Max',
        ownerName: 'John Smith',
        expenseType: Payhawk.ExpenseType.Card,
        isPaid: true,
        paymentData: {},
        document: {
            date: new Date('2021-06-20T00:00:00.000Z'),
            servicePeriod: new Date('2021-06-20T00:00:00.000Z'),
            files: [
                {
                    id: '123',
                    contentType: 'application/pdf',
                    url: 'https://api-local.payhawk.io/files/540dz2g2Dxb6rGoNkY7ZW0QPKVdj1VnxA0L1wpqAl4eXzRvOL3nm985BEJ69jXQA',
                },
            ],
        },
        reconciliation: {
            expenseCurrency: 'EUR',
            expenseTotalAmount: 745.38,
            baseCurrency: 'BGN',
            baseTotalAmount: 1457.84,
            customFields2: {
                teams: {
                    label: 'Teams',
                    selectedValues: {
                        sales_1: {
                            label: 'Sales',
                        },
                    },
                },
                cost1_3: {
                    label: 'Cost centre',
                    externalId: 'cost',
                    externalSource: 'test',
                    selectedValues: {
                        cost_2: {
                            label: 'London',
                        },
                    },
                },
            },
        },
        payments: [],
        supplier: {
            name: 'Deutsche Lufthansa AG',
            address: '',
            countryCode: 'DE',
        },
        externalLinks: [],
        recipient: {
            name: 'Deutsche Lufthansa AG',
        },
        isReadyForReconciliation: true,
        isLocked: false,
        lineItems: [],
        reviewerName: 'Tom Tom',
        approval: {
            status: Payhawk.ExpenseApprovalRequestStatus.Approved,
        },
        transactions: [],
        balancePayments: [],

        ...(patch || {}),
    };
}
