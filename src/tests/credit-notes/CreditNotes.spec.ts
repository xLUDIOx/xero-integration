import { CreditNote, Payment } from 'xero-node';

import { CreditNotesTestEnvironment } from './CreditNotesTestEnvironment';

describe('Credit notes export module tests', () => {
    let testEnv: CreditNotesTestEnvironment;

    beforeEach(() => {
        testEnv = new CreditNotesTestEnvironment();

        testEnv.setupOrganisationResponseMock();
        testEnv.setupValidAccessToken();
        testEnv.setupApiKey();
    });

    afterEach(() => {
        testEnv.verifyAndReset();
    });

    describe('export accounting entity', () => {
        const expenseId = '1000';

        it('should create a new unpaid credit note for unsettled expense', async () => {
            const expense = testEnv.setupRefundExpenseResponseMock(expenseId, { isReadyForReconciliation: false });

            testEnv.setupContactsByVatResponseMock(expense.recipient.vat!);
            testEnv.setupDefaultExpenseAccountsResponseMock();
            testEnv.setupCurrencyResponseMock(expense.transactions[0].cardCurrency);

            const amount = 16;
            const creditNoteNumber = expense.document?.number!;
            testEnv.setupCreditNoteNotFoundResponse(creditNoteNumber);

            const creditNote = testEnv.setupCreateCreditNoteResponse(
                (notes = []) => verifyCreditNoteLineItemAmount(notes, amount),
            );

            testEnv.setupNoCreditNotePayments(creditNote.creditNoteID!);

            await testEnv.exportExpense(expense.id);
        });

        it('should create a new paid credit note for settled expense', async () => {
            const expense = testEnv.setupRefundExpenseResponseMock(expenseId);
            const expenseCurrency = expense.transactions[0].cardCurrency;

            testEnv.setupContactsByVatResponseMock(expense.recipient.vat!);
            testEnv.setupDefaultExpenseAccountsResponseMock();
            testEnv.setupCurrencyResponseMock(expenseCurrency);
            testEnv.setupBankAccountsResponseMock(expenseCurrency);

            const amount = 16;
            const creditNoteNumber = expense.document?.number!;

            testEnv.setupCreditNoteNotFoundResponse(creditNoteNumber);
            testEnv.setupCreateCreditNoteResponse(
                (notes = []) => verifyCreditNoteLineItemAmount(notes, amount),
            );
            testEnv.setupCreateCreditNotePaymentResponse(p => verifyCreditNotePaymentAmount(p, amount));

            await testEnv.exportExpense(expense.id);
        });

        it('should create a new paid credit note for settled expense and takes into account fx fees as well', async () => {
            const expense = testEnv.setupRefundExpenseWithFeesResponseMock(expenseId);
            const expenseCurrency = expense.transactions[0].cardCurrency;

            testEnv.setupContactsByVatResponseMock(expense.recipient.vat!);
            testEnv.setupDefaultExpenseAccountsResponseMock();
            testEnv.setupCurrencyResponseMock(expenseCurrency);
            testEnv.setupBankAccountsResponseMock(expenseCurrency);

            const amountWithDeductedTransactionFees = 14;
            const creditNoteNumber = expense.document?.number!;

            testEnv.setupCreditNoteNotFoundResponse(creditNoteNumber);
            testEnv.setupCreateCreditNoteResponse();
            testEnv.setupCreateCreditNotePaymentResponse(p => verifyCreditNotePaymentAmount(p, amountWithDeductedTransactionFees));

            await testEnv.exportExpense(expense.id);
        });

        const verifyCreditNoteLineItemAmount = (creditNotes: CreditNote[], amount: number) => {
            const item = creditNotes[0];
            expect(item).not.toEqual(undefined);
            expect(item.lineItems).toHaveLength(1);
            expect(item.lineItems![0].unitAmount).toEqual(amount);
        };

        const verifyCreditNotePaymentAmount = (p: Payment, amount: number) => {
            expect(p.amount).toEqual(amount);
        };
    });
});
