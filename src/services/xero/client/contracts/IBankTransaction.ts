import { BankTransaction } from 'xero-node';

export type IBankTransaction = Required<Pick<BankTransaction, 'bankTransactionID' | 'isReconciled' | 'contact' | 'reference'>>;
