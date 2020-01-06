import { BankAccount } from 'xero-node/lib/AccountingAPI-models';
import { AccountType, BankAccountStatusCode } from './ClientContracts';

export interface IBankAccount extends BankAccount {
    Status: BankAccountStatusCode;
    Type: AccountType.Bank;
}
