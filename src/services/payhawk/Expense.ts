export interface IExpense {
    id: string;
    createdAt: Date;
    title: string;
    note: string;
    ownerName: string;
    category?: string;
    document?: IDocument;
    supplier: ISupplier;
    reconciliation: IReconciliation;
    transactions: ITransaction[];
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
    date: Date;
    number: string;
    files: IFile[];
}

export interface IFile {
    url: string;
    contentType: string;
}

export interface IReconciliation {
    expenseTotalAmount: number;
    expenseTaxAmount: number;
    expenseCurrency: string;
    baseTotalAmount: number;
    baseTaxAmount: number;
    baseCurrency: string;
    customFields: {
        [fieldName: string]: string;
    };
    accountCode?: string;
}

export interface ITransaction {
    id: string;
    settlementDate: Date;
    cardHolderName: string;
    paidCurrency: string;
    paidAmount: number;
    cardCurrency: string;
    cardAmount: number;
    description: string;
}
