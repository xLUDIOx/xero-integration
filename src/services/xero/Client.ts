import { AccountingAPIClient as XeroClient } from 'xero-node';
import { BankTransaction } from 'xero-node/lib/AccountingAPI-models';
import { AccessToken } from 'xero-node/lib/internals/OAuth1HttpClient';

import { getXeroConfig } from './Config';
import { IAccountCode } from './IAccountCode';
import { IClient } from './IClient';

export class Client implements IClient {
    private readonly xeroClient: XeroClient;

    constructor(accountId: string, accessToken: AccessToken) {
        this.xeroClient = new XeroClient(getXeroConfig(accountId), accessToken);
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        const accountsResponse = await this.xeroClient.accounts.get({ where: 'Class=="EXPENSE"' });
        const xeroAccountCodes: IAccountCode[] = accountsResponse.Accounts.map(a => ({
            code: a.Code,
            name: a.Name,
        }));

        return xeroAccountCodes;
    }

    async createTransaction(): Promise<void> {
        const transaction: BankTransaction = {
            Type: 'SPEND',
            BankAccount: {
                AccountID: 'DF1AA4CC-8290-4FE3-9534-76E0AA77DE1B',
            },
            Contact: {
                ContactID: '122737a5-004c-4f71-b9cb-68ae7b15a5df',
            },
            LineItems: [
                {
                    Description: 'Some fixed thing',
                    AccountCode: '400',
                    Quantity: 1,
                    UnitAmount: 20,
                },
            ],
        };

        await this.xeroClient.bankTransactions.create(transaction);
    }
}
