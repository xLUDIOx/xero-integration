export interface IPayment {
    bankAccountId: string;
    date: string;
    amount: number;
    fxFees?: number;
    posFees?: number;
    bankFees?: number;
    currency: string;
}
