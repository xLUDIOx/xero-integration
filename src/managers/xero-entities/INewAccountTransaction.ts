export interface INewAccountTransaction {
    bankAccountId: string;
    contactId: string;
    description?: string;
    reference: string;
    totalAmount: number;
    accountCode?: string;
}
