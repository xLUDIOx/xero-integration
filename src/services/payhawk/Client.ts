import * as request from 'request-promise';

import { config } from '../../Config';
import { IExpense } from './Expense';
import { IAccountCode } from './IAccountCode';
import { IClient } from './IClient';

export class Client implements IClient {
    private readonly headers: { [key: string]: string };

    constructor(private readonly accountId: string, apiKey: string) {
        this.headers = {
            'X-Payhawk-ApiKey': apiKey,
        };
    }

    async getExpense(expenseId: string): Promise<IExpense> {
        const result = await request(`${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/expenses/${encodeURIComponent(expenseId)}`, {
            method: 'GET', json: true, headers: this.headers,
        });

        return result;
    }

    async synchronizeChartOfAccounts(accountCodes: IAccountCode[]) {
        await request(`${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/accounting-codes`, {
            method: 'PUT', json: accountCodes, headers: this.headers,
        });
    }
}
