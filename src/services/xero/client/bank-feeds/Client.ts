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

    async getOrCreateBankFeedConnection({ accountName, accountNumber, accountToken, accountType, currency }: INewBankFeedConnection): Promise<IBankFeedConnection> {
        const logger = this.logger.child({ bankFeedConnectionParams: { accountName, accountNumber, accountToken, currency } });

        let feedConnection = await this.getBankFeedConnectionByAccountDetails(accountNumber, accountToken, currency, logger);
        if (!feedConnection) {
            feedConnection = await this.createBankFeedConnection({ accountName, accountNumber, accountToken, accountType, currency }, logger);
        }

        if (!feedConnection) {
            throw logger.error(Error('Could not get or create bank feed connection'));
        }

        let retries = 1;

        while (feedConnection.status && feedConnection.status === BankFeedConnectionStatus.Pending) {
            if (retries === MAX_BANK_FEED_CONNECTIONS_RETRIES) {
                throw logger.error(Error(`Bank feed connection is still PENDING after ${MAX_BANK_FEED_CONNECTIONS_RETRIES} retries`));
            }

            logger.info(`Bank feed connection is PENDING, waiting to be ready ${BANK_FEED_CONNECTIONS_DELAY} ms before trying again`);

            await sleep(BANK_FEED_CONNECTIONS_DELAY);

            feedConnection = await this.getBankFeedConnectionByAccountDetails(accountNumber, accountToken, currency, logger);
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

    async getStatementById(statementId: string): Promise<IBankStatement | undefined> {
        const url = buildUrl(
            this.baseUrl(),
            `/Statements/${encodeURIComponent(statementId)}`,
        );

        const item = await this.httpClient.request<IBankStatement | undefined>({
            url,
            method: 'GET',
        });

        return item;
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

    private async getBankFeedConnectionByAccountDetails(accountNumber: string, accountToken: string, currency: Currency, baseLogger: ILogger): Promise<IBankFeedConnection | undefined> {
        const url = buildUrl(
            this.baseUrl(),
            '/FeedConnections',
        );

        const bankFeedConnectionItems = await this.httpClient.request<IBankFeedConnection[]>({
            url,
            method: 'GET',
            entityResponseType: EntityResponseType.Items.toLowerCase(),
        });

        const logger = baseLogger.child({ bankFeedConnectionItems });
        logger.info('Fetched bank feed connections');

        const feedConnection = bankFeedConnectionItems.find(c => c.accountNumber === accountNumber && c.accountToken === accountToken && c.currency === currency);
        if (!feedConnection) {
            logger.info('Did not find bank feed connection');
        }

        return feedConnection;
    }

    private async createBankFeedConnection(connection: INewBankFeedConnection, baseLogger: ILogger): Promise<IBankFeedConnection> {
        const url = buildUrl(
            this.baseUrl(),
            '/FeedConnections',
        );

        baseLogger.info('Creating new bank feed connection');

        const createItems = await this.httpClient.request<IBankFeedConnection[]>({
            url,
            method: 'POST',
            data: {
                items: [connection],
            },
            entityResponseType: EntityResponseType.Items.toLowerCase(),
        });

        const newBankFeedConnection = createItems[0];
        const logger = baseLogger.child({ newBankFeedConnection });
        if (newBankFeedConnection.status === BankFeedConnectionStatus.Rejected) {
            throw logger.error(Error('Creating bank feed connection was rejected. See inner response for details'));
        }

        logger.info('Bank feed connection created');

        return newBankFeedConnection;
    }

    private baseUrl(): string {
        return `${this.env.xeroApiUrl}${API_PREFIX}`;
    }
}

const API_PREFIX = '/bankfeeds.xro/1.0';
const MAX_BANK_FEED_CONNECTIONS_RETRIES = 3;
const BANK_FEED_CONNECTIONS_DELAY = 3000; // 3 sec
