export interface IExpense {
    id: string;
    createdAt: string;
    title: string;
    note: string;
    ownerName: string;
    isPaid?: boolean;
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
    type: 'invoice' | 'receipt' | 'other';
    date?: string;
    number?: string;
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
    customFields: {
        [fieldName: string]: string;
    };
    accountCode?: string;
}

export interface IPaymentData {
    dueDate?: string;
    source?: string;
}

export interface ITransaction {
    id: string;
    settlementDate: string;
    cardName?: string;
    cardHolderName: string;
    cardLastDigits: string;
    paidCurrency: string;
    paidAmount: number;
    cardCurrency: string;
    cardAmount: number;
    description: string;
    fees: number;
}
