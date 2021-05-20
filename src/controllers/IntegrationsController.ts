import { boundMethod } from 'autobind-decorator';
import { TokenSet } from 'openid-client';
import { Request, Response } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { Integration, XeroConnection } from '@managers';
import { Xero } from '@services';
import { IPayhawkPayload, PayhawkEvent } from '@shared';
import { ExportError, ILogger, payhawkSigned } from '@utils';

export class IntegrationsController {
    constructor(
        private readonly connectionManagerFactory: XeroConnection.IManagerFactory,
        private readonly integrationManagerFactory: Integration.IManagerFactory,
        private readonly baseLogger: ILogger,
    ) {
    }

    @boundMethod
    @payhawkSigned
    async handlePayhawkEvent(req: Request, res: Response) {
        const payload = req.body as IPayhawkPayload;
        const payloadData = payload.data || {};
        const event = payload.event;
        const accountId = payload.accountId;

        const logger = this.baseLogger.child({ accountId, event }, req);

        const connectionManager = this.connectionManagerFactory({ accountId }, logger);
        if (event === PayhawkEvent.ApiKeySet) {
            logger.info('New API key received');

            await connectionManager.setPayhawkApiKey(payloadData.apiKey);
            return res.send(204);
        }

        const xeroAccessToken = await connectionManager.getAccessToken();
        if (event === PayhawkEvent.Disconnect) {
            logger.info('Disconnect received');

            if (xeroAccessToken) {
                const activeTenantId = await connectionManager.getActiveTenantId();
                const authorizedTenants = await connectionManager.getAuthorizedTenants(xeroAccessToken);
                const isAuthorizedForActiveTenant = authorizedTenants.some(t => t.tenantId === activeTenantId);

                if (isAuthorizedForActiveTenant) {
                    logger.info('Current tenant is authorized with available access token, disconnecting bank feed');

                    const integrationManager = await this.createIntegrationManager(connectionManager, accountId, xeroAccessToken, logger);
                    await integrationManager.disconnectBankFeed();
                } else {
                    logger.info('Current tenant is not authorized with available access token, will not disconnect bank feed');
                }
            }

            await connectionManager.disconnectActiveTenant();

            logger.info('Disconnect processed');

            return res.send(204);
        }

        if (!xeroAccessToken) {
            throw new UnauthorizedError('Invalid Xero access token. Please reconnect and try again');
        }

        switch (event) {
            case PayhawkEvent.Initialize: {
                const result = await this.initialize(
                    connectionManager,
                    accountId,
                    xeroAccessToken,
                    logger,
                );

                return res.send(200, result);
            }
            case PayhawkEvent.ExpenseExport: {
                return await this.wrapInErrorHandler(
                    () => this.exportExpense(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    ),
                    res,
                    logger,
                );
            }
            case PayhawkEvent.ExpenseDelete: {
                return await this.wrapInErrorHandler(
                    () => this.deleteExpense(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    ),
                    res,
                    logger,
                );
            }
            case PayhawkEvent.TransferExport: {
                return await this.wrapInErrorHandler(
                    () => this.exportSingleTransfer(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    ),
                    res,
                    logger,
                );
            }
            case PayhawkEvent.TransfersExport: {
                return await this.wrapInErrorHandler(
                    () => this.exportTransfers(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    ),
                    res,
                    logger,
                );
            }
            case PayhawkEvent.BankStatementExport: {
                return await this.wrapInErrorHandler(
                    () => this.exportBankStatement(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    ),
                    res,
                    logger,
                );
            }
            case PayhawkEvent.ChartOfAccountSynchronize: {
                await this.syncChartOfAccounts(connectionManager, xeroAccessToken, accountId, logger);
                break;
            }
            case PayhawkEvent.TaxRatesSynchronize: {
                await this.syncTaxRates(connectionManager, xeroAccessToken, accountId, logger);
                break;
            }
            case PayhawkEvent.BankAccountsSynchronize: {
                await this.syncBankAccounts(connectionManager, xeroAccessToken, accountId, logger);
                break;
            }
            case PayhawkEvent.ExternalCustomFieldsSynchronize: {
                await this.syncTrackingCategories(connectionManager, xeroAccessToken, accountId, logger);
                break;
            }
            default:
                return res.send(400, 'Unknown event');
        }

        res.send(204);
    }

    private async initialize(connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, logger: ILogger) {
        logger.info(`Initialize started`);

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        const result = await integrationManager.initialSynchronization();

        logger.info(`Initialize completed`);

        return result;
    }

    private async exportExpense(payloadData: any, connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, baseLogger: ILogger) {
        const { expenseId } = payloadData;
        if (!expenseId) {
            throw Error('Expense ID is required');
        }

        const logger = baseLogger.child({ expenseId });
        logger.info(`Export expense started`);

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);

        await integrationManager.exportExpense(expenseId);

        logger.info(`Export expense completed`);
    }

    private async deleteExpense(payloadData: any, connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, baseLogger: ILogger) {
        const { expenseId } = payloadData;
        if (!expenseId) {
            throw Error('Expense ID is required');
        }

        const logger = baseLogger.child({ expenseId });

        logger.info(`Delete expense started`);

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);

        await integrationManager.deleteExpense(expenseId);

        logger.info(`Delete expense completed`);
    }

    private async exportSingleTransfer(payloadData: any, connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, baseLogger: ILogger) {
        const { balanceId, transferId } = payloadData;
        if (!balanceId || !transferId) {
            throw Error('Balance ID and transfer ID are required');
        }

        const logger = baseLogger.child({ balanceId, transferId });

        logger.info('Export transfer started');

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        await integrationManager.exportTransfer(balanceId, transferId);

        logger.info('Export transfer completed');
    }

    private async exportBankStatement(payloadData: any, connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, baseLogger: ILogger) {
        const { expenseId, balanceId, transferId } = payloadData;

        const logger = baseLogger.child({ expenseId, balanceId, transferId });

        if (!Xero.hasScope(Xero.XeroScope.BankFeeds)) {
            logger.warn('Bank Feeds scope is not enabled');
            return;
        }

        if (!Xero.isAccessTokenAuthorizedForScope(accessToken, Xero.XeroScope.BankFeeds)) {
            logger.warn('Access token is not authorized for exporting bank feeds');
            return;
        }

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        const organisation = await integrationManager.getOrganisation();
        if (organisation.isDemoCompany) {
            throw new ExportError(`Failed to export bank statements. You are using a demo organization in Xero.`);
        }

        logger.info('Export bank statement started');

        if (expenseId) {
            await integrationManager.exportBankStatementForExpense(expenseId);
        } else if (balanceId && transferId) {
            await integrationManager.exportBankStatementForTransfer(balanceId, transferId);
        } else {
            throw logger.error(Error('Missing parameters for bank statement export'));
        }

        logger.info('Export bank statement completed');
    }

    private async exportTransfers(payloadData: any, connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, baseLogger: ILogger) {
        if (!payloadData.startDate || !payloadData.endDate) {
            throw Error('Start and end date are required');
        }

        const logger = baseLogger.child({ startDate: payloadData.startDate, endDate: payloadData.endDate });

        logger.info('Export transfers started');

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        await integrationManager.exportTransfers(payloadData.startDate, payloadData.endDate);

        logger.info('Export transfers completed');
    }

    private async syncBankAccounts(connectionManager: XeroConnection.IManager, accessToken: TokenSet, accountId: string, logger: ILogger) {
        logger.info('Sync bank accounts started');

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        await integrationManager.synchronizeBankAccounts();

        logger.info('Sync bank accounts completed');
    }

    private async syncChartOfAccounts(connectionManager: XeroConnection.IManager, accessToken: TokenSet, accountId: string, logger: ILogger) {
        logger.info('Sync chart of accounts started');

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        await integrationManager.synchronizeChartOfAccounts();

        logger.info('Sync chart of accounts completed');
    }

    private async syncTrackingCategories(connectionManager: XeroConnection.IManager, accessToken: TokenSet, accountId: string, logger: ILogger) {
        logger.info('Sync tracking categories started');

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        await integrationManager.synchronizeTrackingCategories();

        logger.info('Sync tracking categories completed');
    }

    private async syncTaxRates(connectionManager: XeroConnection.IManager, accessToken: TokenSet, accountId: string, logger: ILogger) {
        logger.info('Sync tax rates started');

        const integrationManager = await this.createIntegrationManager(connectionManager, accountId, accessToken, logger);
        await integrationManager.synchronizeTaxRates();

        logger.info('Sync tax rates completed');
    }

    private async createIntegrationManager(connectionManager: XeroConnection.IManager, accountId: string, accessToken: TokenSet, logger: ILogger): Promise<Integration.IManager> {
        const tenantId = await connectionManager.getActiveTenantId();
        if (!tenantId) {
            throw Error('No active tenant found for this account');
        }

        const payhawkApiKey = await connectionManager.getPayhawkApiKey();
        const integrationManager = this.integrationManagerFactory(
            {
                accessToken,
                tenantId,
                accountId,
                payhawkApiKey,
            },
            logger,
        );

        return integrationManager;
    }

    private async wrapInErrorHandler(asyncAction: () => Promise<void>, res: Response, logger: ILogger) {
        try {
            await asyncAction();
            return res.send(204);
        } catch (err) {
            if (err instanceof ExportError) {
                logger.child({
                    errorMessage: err.message,
                    innerError: {
                        message: err.innerError?.message,
                    },
                }).warn`Export failed`;
                return res.send(400, err.message);
            } else {
                throw err;
            }
        }
    }
}
