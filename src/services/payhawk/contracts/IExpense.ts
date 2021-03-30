import { ITaxRate } from './ITaxRate';

export interface IExpense {
    id: string;
    createdAt: string;
    title: string;
    note: string;
    ownerName: string;
    isPaid?: boolean;
    taxRate?: ITaxRate;
    category?: string;
    document?: IDocument;
    supplier: ISupplier;
    reconciliation: IReconciliation;
    paymentData: IPaymentData;
    transactions: ITransaction[];
    externalLinks: IExternalLink[];
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

export interface IDocument {
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
    selectedValues: {
        [valueId: string]: IExpenseCustomFieldValueData;
    } | null;
}

export interface IExpenseCustomFieldValueData {
    label: string;
    externalId: string | null;
    owner: string | null;
    parentId: string | null;
    childId: string | null;
}

export interface IPaymentData {
    dueDate?: string;
    date?: string;
    source?: string;
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
