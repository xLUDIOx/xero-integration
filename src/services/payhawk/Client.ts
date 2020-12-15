import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as mime from 'mime-types';
import * as requestNative from 'request';
import * as request from 'request-promise';

import { config } from '../../Config';
import { IAccountCode, IBalance, IBalanceTransfer, IBusinessAccount, IClient, IDownloadedFile, IExpense, IFile, ITaxRate } from './contracts';

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

    async updateExpense(expenseId: string, patch: Partial<IExpense>): Promise<void> {
        const { externalLinks } = patch;
        await request(
            `${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/expenses/${encodeURIComponent(expenseId)}/links`,
            {
                method: 'PUT',
                json: true,
                headers: this.headers,
                body: {
                    externalLinks,
                },
            });
    }

    async getTransfer(balanceId: string, transferId: string): Promise<IBalanceTransfer | undefined> {
        const url = `${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/balances/${encodeURIComponent(balanceId)}/transfers/${encodeURIComponent(transferId)}`;

        const result = await request(url, {
            method: 'GET',
            json: true,
            headers: this.headers,
        });

        return result;
    }

    async getBankAccounts(): Promise<IBalance[]> {
        const url = `${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/balances`;
        const result = await request(url, {
            method: 'GET',
            json: true,
            headers: this.headers,
        });

        return result;
    }

    async getTransfers(startDate: string, endDate: string): Promise<IBalanceTransfer[]> {
        const queryString = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        const url = `${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/transfers?${queryString}`;
        const result = await request(url, {
            method: 'GET',
            json: true,
            headers: this.headers,
        });

        return result;
    }

    async synchronizeChartOfAccounts(accountCodes: IAccountCode[]) {
        await request(`${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/accounting-codes`, {
            method: 'PUT', json: accountCodes, headers: this.headers,
        });
    }

    async synchronizeTaxRates(taxRates: ITaxRate[]) {
        await request(`${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/tax-rates`, {
            method: 'PUT', json: taxRates, headers: this.headers,
        });
    }

    async synchronizeBankAccounts(accounts: IBusinessAccount[]) {
        await request(`${config.payhawkUrl}/api/v2/accounts/${encodeURIComponent(this.accountId)}/business-accounts`, {
            method: 'PUT', json: accounts, headers: this.headers,
        });
    }

    async downloadFiles(expense: IExpense): Promise<IDownloadedFile[]> {
        if (!expense.document) {
            return [];
        }

        return await Promise.all(expense.document.files.map(async (f: IFile): Promise<IDownloadedFile> => {
            const extension = mime.extension(f.contentType) || 'jpg';
            const fileName = path.basename(f.url) + '.' + extension;
            const filePath = path.join(os.tmpdir(), `${Math.trunc(Math.random() * 1000000)}.${fileName}`);
            const file = fs.createWriteStream(filePath);

            await new Promise<void>((resolve, reject) => {
                requestNative({ uri: f.url })
                    .pipe(file)
                    .on('close', () => { resolve(); });
            });

            return {
                contentType: f.contentType,
                fileName,
                path: filePath,
            };
        }));
    }
}
