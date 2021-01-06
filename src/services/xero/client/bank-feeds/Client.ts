import { IEnvironment } from '@environment';
import { BankFeedConnectionStatus, Currency, IBankFeedConnection, IBankStatement, INewBankFeedConnection, INewBankStatement } from '@shared';
import { ILogger, sleep } from '@utils';

import { EntityResponseType, IHttpClient } from '../../http';
import { buildUrl } from '../../shared';
import { IClient } from './IClient';

export class Client implements IClient {
    constructor(
        private readonly httpClient: IHttpClient,
        private readonly logger: ILogger,
        private readonly env: IEnvironment,
    ) {
    }

    async getOrCreateBankFeedConnection({ accountId, accountToken, accountType, currency }: INewBankFeedConnection): Promise<IBankFeedConnection> {
        const logger = this.logger.child({ bankFeedConnection: { accountId, accountToken, currency } });

        let feedConnection = await this.getBankFeedConnectionByAccountDetails(accountId, accountToken, currency);
        if (!feedConnection) {
            feedConnection = await this.createBankFeedConnection({ accountId, accountToken, accountType, currency });
        }

        if (!feedConnection) {
            throw logger.error(Error('Could not get or create bank feed connection'));
        }

        let retries = 1;

        while (feedConnection.status && feedConnection.status === BankFeedConnectionStatus.Pending) {
            if (retries === 1) {
                logger.info('Bank feed connection is PENDING, waiting to be ready');
            }

            if (retries === MAX_BANK_FEED_CONNECTIONS_RETRIES) {
                throw logger.error(Error(`Bank feed connection is still PENDING after ${MAX_BANK_FEED_CONNECTIONS_RETRIES} retries`));
            }

            logger.info(`Waiting ${BANK_FEED_CONNECTIONS_DELAY} ms before trying again`);

            await sleep(BANK_FEED_CONNECTIONS_DELAY);

            feedConnection = await this.getBankFeedConnectionByAccountDetails(accountId, accountToken, currency);

            if (!feedConnection) {
                throw logger.error(Error('Could not get bank feed connection'));
            }

            retries++;
        }

        return feedConnection;
    }

    async createBankStatement(statement: INewBankStatement): Promise<IBankStatement> {
        const url = buildUrl(
            this.baseUrl(),
            '/Statements',
        );

        const createItems = await this.httpClient.request<IBankStatement[]>({
            url,
            method: 'POST',
            data: {
                items: [statement],
            },
            entityResponseType: EntityResponseType.Items.toLowerCase(),
        });

        return createItems[0];
    }

    async closeBankFeedConnection(connectionId: string): Promise<void> {
        const url = buildUrl(
            this.baseUrl(),
            '/FeedConnections/DeleteRequests',
        );

        await this.httpClient.request({
            url,
            method: 'POST',
            data: {
                items: [{ id: connectionId }],
            },
        });
    }

    private async getBankFeedConnectionByAccountDetails(accountId: string, accountToken: string, currency: Currency): Promise<IBankFeedConnection | undefined> {
        const url = buildUrl(
            this.baseUrl(),
            '/FeedConnections',
        );

        const getItems = await this.httpClient.request<IBankFeedConnection[]>({
            url,
            method: 'GET',
            entityResponseType: EntityResponseType.Items.toLowerCase(),
        });

        const feedConnection = getItems.find(c => c.accountId === accountId && c.accountToken === accountToken && c.currency === currency);
        return feedConnection;
    }

    private async createBankFeedConnection(connection: INewBankFeedConnection): Promise<IBankFeedConnection> {
        const url = buildUrl(
            this.baseUrl(),
            '/FeedConnections',
        );

        const createItems = await this.httpClient.request<IBankFeedConnection[]>({
            url,
            method: 'POST',
            data: {
                items: [connection],
            },
            entityResponseType: EntityResponseType.Items.toLowerCase(),
        });

        return createItems[0];
    }

    private baseUrl(): string {
        return `${this.env.xeroApiUrl}${API_PREFIX}`;
    }
}

const API_PREFIX = '/bankfeeds.xro/1.0';
const MAX_BANK_FEED_CONNECTIONS_RETRIES = 3;
const BANK_FEED_CONNECTIONS_DELAY = 3000; // 3 sec
