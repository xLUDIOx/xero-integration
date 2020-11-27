import { Client } from './Client';
import { IClient } from './contracts';

export * from './contracts';

export const createPayhawkClient = (accountId: string, apiKey: string): IClient => {
    return new Client(accountId, apiKey);
};
