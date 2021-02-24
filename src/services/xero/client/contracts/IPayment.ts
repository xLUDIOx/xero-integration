import { Payment } from 'xero-node';

import { IBankAccount } from './IBankAccount';

export interface IPayment extends Required<Pick<Payment, 'paymentID' | 'amount' | 'currencyRate' | 'date' | 'isReconciled'>> {
    account: Pick<IBankAccount, 'accountID' | 'code'>;
}
