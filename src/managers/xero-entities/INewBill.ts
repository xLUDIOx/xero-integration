export interface INewBill {
    contactId: string;
    description?: string;
    currency: string;
    totalAmount: number;
    accountCode?: string;
}
