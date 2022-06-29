export interface IDeposit {
    externalId?: string;
    externalUrl?: string;
    bankAccountId: string;
    glAccountId: string;
    amount: number;
    date: Date;
    note: string;
}
