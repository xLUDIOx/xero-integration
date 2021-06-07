import { ITaxRate } from './ITaxRate';

export interface IExpense {
    id: string;
    createdAt: string;
    title: string;
    note: string;
    ownerName: string;
    isPaid?: boolean;
    isReadyForReconciliation?: boolean;
    isLocked?: boolean;
    taxRate?: ITaxRate;
    category?: string;
    document?: IDocument;
    supplier: ISupplier;
    reconciliation: IReconciliation;
    paymentData: IPaymentData;
    transactions: ITransaction[];
    externalLinks: IExternalLink[];
    recipient: IRecipient;
    balancePayments: IBalancePayment[];
}

export interface IBalancePayment {
    id: string;
    amount: number;
    fees: number;
    date: string;
    status: BalancePaymentStatus;
    currency: string;
}

export enum BalancePaymentStatus {
    PendingConfirmation = 'pending_confirmation',
    Rejected = 'rejected',
    Approved = 'approved',
    Authorized = 'authorized',
    Settled = 'settled'
}

export interface IExternalLink {
    title: string;
    url: string;
}

export interface ISupplier {
    name: string;
    countryCode: string;
    address: string;
    vat?: string;
    uic?: string;
}

export interface IRecipient {
    name: string;
    vat?: string;
    email?: string;
}

export interface IDocument {
    number?: string;
    date?: string;
    files: IFile[];
}

export interface IFile {
    url: string;
    contentType: string;
}

export interface IReconciliation {
    expenseTotalAmount: number;
    expenseTaxAmount: number;
    expenseCurrency?: string;
    baseTotalAmount: number;
    baseTaxAmount: number;
    baseCurrency: string;
    customFields2?: {
        [fieldId: string]: IExpenseCustomFieldData;
    };
    accountCode?: string;
}

export interface IExpenseCustomFieldData {
    label: string;
    externalId?: string;
    externalSource?: string;
    selectedValues?: {
        [valueId: string]: IExpenseCustomFieldValueData;
    };
}

export interface IExpenseCustomFieldValueData {
    label: string;
    externalId?: string;
    owner?: string;
    parentId?: string;
    childId?: string;
}

export interface IPaymentData {
    dueDate?: string;
    date?: string;
    source?: string;
    sourceType?: PaymentSourceType;
}

export enum PaymentSourceType {
    Card = 'card',
    Balance = 'balance',
    Bank = 'bank_account'
}

export interface ITransaction {
    id: string;
    date: string;
    settlementDate?: string;
    cardName?: string;
    cardHolderName: string;
    cardLastDigits: string;
    paidCurrency: string;
    paidAmount: number;
    cardCurrency: string;
    cardAmount: number;
    description: string;
    fees: {
        fx: number;
        pos: number;
    };
}
