export interface ITaxRate {
    name: string;

    /**
     * Effective tax rate (4 decimal points) e.g. 12.5000
     */
    effectiveRate: string;

    /**
     * Unique code that identifies the tax rate item, e.g. TAX001
     */
    taxType: string;
    status: TaxRateStatus;
}

export enum TaxRateStatus {
    /**
     * The tax rate is active and can be used in transactions
     */
    Active = 'ACTIVE',
    /**
     * The tax rate is deleted and cannot be restored or used on transactions
     */
    Deleted = 'DELETED',
    /**
     * The tax rate has been used on a transaction (e.g. an invoice) but has since been deleted. ARCHIVED tax rates cannot be restored or used on transactions.
     */
    Archived = 'ARCHIVED'
}

export enum TaxType {
    None = 'NONE',
    TaxOnPurchases = 'INPUT',
}
