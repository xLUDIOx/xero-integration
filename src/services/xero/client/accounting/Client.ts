import { IEnvironment } from '@environment';
import { AccountStatus, AccountType, IAccountCode, INewAccountCode, IOrganisation, ITaxRate, TaxRateStatus } from '@shared';
import { ILogger, ObjectSerializer } from '@utils';

import { EntityResponseType, IHttpClient } from '../../http';
import { buildUrl } from '../../shared';
import { IClient } from './contracts';

export class Client implements IClient {
    constructor(
        private readonly httpClient: IHttpClient,
        private readonly logger: ILogger,
        private readonly env: IEnvironment,
    ) {
    }

    async getOrganisation(): Promise<IOrganisation> {
        const url = buildUrl(
            this.baseUrl(),
            '/Organisations',
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });

        const responseItems = response[EntityResponseType.Organisations];
        const organisations = ObjectSerializer.deserialize<IOrganisation[]>(responseItems);

        // since request contains tenant ID
        // the response will include only a single org
        return organisations[0];
    }

    async getTaxRates(): Promise<ITaxRate[]> {
        const url = buildUrl(
            this.baseUrl(),
            '/TaxRates',
            {
                where: `CanApplyToExpenses==true&&Status=="${TaxRateStatus.Active}"`,
            }
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });

        const responseItems = response[EntityResponseType.TaxRates];
        const taxRates = ObjectSerializer.deserialize<ITaxRate[]>(responseItems);
        return taxRates;
    }

    async getExpenseAccounts(): Promise<IAccountCode[]> {
        const url = buildUrl(
            this.baseUrl(),
            '/Accounts',
            {
                where: DEFAULT_EXPENSE_ACCOUNT_FILTER,
            }
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });

        const responseItems = response[EntityResponseType.Accounts];
        const expenseAccounts = ObjectSerializer.deserialize<IAccountCode[]>(responseItems);
        return expenseAccounts;
    }

    async getOrCreateExpenseAccount({ name, code, addToWatchlist }: INewAccountCode): Promise<IAccountCode> {
        const logger = this.logger.child({ name, code, addToWatchlist });

        let expenseAccount = await this.getExpenseAccountByCode(code);
        if (!expenseAccount) {
            expenseAccount = await this.createExpenseAccount(name, code, logger);
        }

        if (addToWatchlist && !expenseAccount.addToWatchlist) {
            expenseAccount = await this.addExpenseAccountToWatchlist(expenseAccount.accountId, logger);
        }

        return expenseAccount;
    }

    private async getExpenseAccountByCode(code: string): Promise<IAccountCode | undefined> {
        const url = buildUrl(
            this.baseUrl(),
            '/Accounts',
            {
                where: `Class=="${AccountType.Expense}"&&Code=="${code}"`,
            }
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });

        const responseItems = response[EntityResponseType.Accounts];
        const expenseAccounts = ObjectSerializer.deserialize<IAccountCode[]>(responseItems);
        return expenseAccounts[0];
    }

    private async createExpenseAccount(name: string, code: string, logger: ILogger): Promise<IAccountCode> {
        const url = buildUrl(
            this.baseUrl(),
            '/Accounts',
        );

        const response = await this.httpClient.request({
            url,
            method: 'PUT',
            data: {
                Name: name,
                Code: code,
                Type: AccountType.Expense,
            },
        });

        const responseItems = response[EntityResponseType.Accounts];
        const expenseAccounts = ObjectSerializer.deserialize<IAccountCode[]>(responseItems);

        if (expenseAccounts.length === 0) {
            throw logger.error(Error('Failed to create expense account'));
        }

        return expenseAccounts[0];
    }

    private async addExpenseAccountToWatchlist(expenseAccountId: string, logger: ILogger): Promise<IAccountCode> {
        const url = buildUrl(
            this.baseUrl(),
            `/Accounts/${encodeURIComponent(expenseAccountId)}`,
        );

        const response = await this.httpClient.request({
            url,
            method: 'POST',
            data: {
                AddToWatchlist: true,
            },
        });

        const responseItems = response[EntityResponseType.Accounts];
        const expenseAccounts = ObjectSerializer.deserialize<IAccountCode[]>(responseItems);

        if (expenseAccounts.length === 0) {
            throw logger.error(Error('Failed to add expense account to watchlist'));
        }

        return expenseAccounts[0];
    }

    private baseUrl(): string {
        return `${this.env.xeroApiUrl}${API_PREFIX}`;
    }
}

const DEFAULT_EXPENSE_ACCOUNT_FILTER = `Class=="${AccountType.Expense}"&&Status=="${AccountStatus.Active}"`;

const API_PREFIX = '/api.xro/2.0';
