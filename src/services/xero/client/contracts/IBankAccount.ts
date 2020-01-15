import { BankAccount } from 'xero-node/lib/AccountingAPI-models';
import { AccountType, BankAccountStatusCode } from './IAccountingApi';

export interface IBankAccount extends BankAccount {
    Name: string;
    AccountID: string;
    CurrencyCode: string;
    BankAccountNumber: string;
    Status: BankAccountStatusCode;
    Type: AccountType.Bank;
}
