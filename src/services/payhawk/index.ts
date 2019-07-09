import { Client } from './Client';
import { IClient } from './IClient';

export { IClient };
export * from './Expense';
export const createPayhawkClient = (accountId: string, apiKey: string): IClient => {
    return new Client(accountId, apiKey);
};
