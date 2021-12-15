import { IEnvironment } from '@environment';
import { AccountType, IAccountCode, INewAccountCode, IOrganisation, ITaxRate, ITrackingCategory, PaymentStatus, TaxRateStatus, TrackingCategoryStatus } from '@shared';
import { ExportError, ILogger, ObjectSerializer } from '@utils';

import { EntityResponseType, IHttpClient } from '../../http';
import { buildUrl } from '../../shared';
import { IClient, IExpenseAccountsFilter } from './contracts';

export class Client implements IClient {
    constructor(
        private readonly httpClient: IHttpClient,
        private readonly logger: ILogger,
        private readonly env: IEnvironment,
    ) {
    }

    async getTrackingCategories(): Promise<ITrackingCategory[]> {
        const url = buildUrl(
            this.baseUrl(),
            '/TrackingCategories',
            {
                where: `Status=="${TrackingCategoryStatus.Active}"`,
            }
        );

        const response = await this.httpClient.request({
            url,
            method: 'GET',
        });
        const responseItems = response[EntityResponseType.TrackingCategories];
        const categories = ObjectSerializer.deserialize<ITrackingCategory[]>(responseItems);
        return categories;

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

    async getExpenseAccounts({ status }: IExpenseAccountsFilter = {}): Promise<IAccountCode[]> {
        const whereFilters = [
            DEFAULT_EXPENSE_ACCOUNT_FILTER,
        ];

        if (status) {
            whereFilters.push(`Status=="${status}"`);
        }

        const url = buildUrl(
            this.baseUrl(),
            '/Accounts',
            {
                where: whereFilters.join('&&'),
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

    async createExpenseAccount({ name, code, description, taxType, addToWatchlist }: INewAccountCode): Promise<IAccountCode> {
        const logger = this.logger.child({ name, code, description, taxType, addToWatchlist });

        let expenseAccount = await this._createExpenseAccount(name, code, description, taxType, logger);

        if (addToWatchlist && !expenseAccount.addToWatchlist) {
            const updatedExpenseAccount = await this.addExpenseAccountToWatchlist(expenseAccount.accountId, logger);

            expenseAccount = updatedExpenseAccount || expenseAccount;
        }

        return expenseAccount;
    }

    async deletePayment(paymentId: string): Promise<void> {
        const url = buildUrl(
            this.baseUrl(),
            `/Payments/${encodeURIComponent(paymentId)}`,
        );

        await this.httpClient.request({
            url,
            method: 'POST',
            data: {
                [EntityResponseType.Payments]: [{
                    Status: PaymentStatus.Deleted,
                }],
            },
        });
    }

    private async _createExpenseAccount(name: string, code: string, description: string | undefined, taxType: string | undefined, logger: ILogger): Promise<IAccountCode> {
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
                Description: description,
                Type: AccountType.Expense,
                TaxType: taxType,
            },
        });

        const responseItems = response[EntityResponseType.Accounts];
        const expenseAccounts = ObjectSerializer.deserialize<IAccountCode[]>(responseItems);

        if (expenseAccounts.length === 0) {
            throw new ExportError(`Failed to export into Xero. Could not create ${name} expense account`);
        }

        return expenseAccounts[0];
    }

    private async addExpenseAccountToWatchlist(expenseAccountId: string, logger: ILogger): Promise<IAccountCode | undefined> {
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
            logger.warn('Failed to add expense account to watchlist');
        }

        return expenseAccounts[0];
    }

    private baseUrl(): string {
        return `${this.env.xeroApiUrl}${API_PREFIX}`;
    }
}

const DEFAULT_EXPENSE_ACCOUNT_FILTER = `Class=="${AccountType.Expense}"`;

const API_PREFIX = '/api.xro/2.0';
