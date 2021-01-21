import { boundMethod } from 'autobind-decorator';
import { TokenSet } from 'openid-client';
import { Request, Response } from 'restify';

import { Integration, XeroConnection } from '@managers';
import { Xero } from '@services';
import { IPayhawkPayload, PayhawkEvent } from '@shared';
import { ExportError, ILogger, OperationNotAllowedError, payhawkSigned } from '@utils';

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
            res.send(204);

            return;
        }

        const xeroAccessToken = await connectionManager.getAccessToken();
        if (event === PayhawkEvent.Disconnect) {
            logger.info('Disconnect received');

            if (xeroAccessToken) {
                const integrationManager = await this.createIntegrationManager(connectionManager, accountId, xeroAccessToken, logger);
                await integrationManager.disconnect();
            }

            await connectionManager.disconnectActiveTenant();

            logger.info('Disconnect processed');

            res.send(204);
            return;
        }

        if (!xeroAccessToken) {
            logger.error(new Error('Unable to handle event because there is no valid access token'));

            res.send(401);
            return;
        }

        try {
            switch (event) {
                case PayhawkEvent.Initialize: {
                    const result = await this.initialize(
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    );

                    res.send(200, result);
                    return;
                }
                case PayhawkEvent.ExpenseExport: {
                    try {
                        await this.exportExpense(
                            payloadData,
                            connectionManager,
                            accountId,
                            xeroAccessToken,
                            logger,
                        );
                    } catch (err) {
                        if (err instanceof ExportError) {
                            res.send(400, err.message);
                            return;
                        } else {
                            throw err;
                        }
                    }
                    break;
                }
                case PayhawkEvent.ExpenseDelete: {
                    await this.deleteExpense(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    );
                    break;
                }
                case PayhawkEvent.TransferExport: {
                    await this.exportSingleTransfer(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    );
                    break;
                }
                case PayhawkEvent.TransfersExport: {
                    await this.exportTransfers(
                        payloadData,
                        connectionManager,
                        accountId,
                        xeroAccessToken,
                        logger,
                    );
                    break;
                }
                case PayhawkEvent.BankStatementExport: {
                    try {
                        await this.exportBankStatement(
                            payloadData,
                            connectionManager,
                            accountId,
                            xeroAccessToken,
                            logger,
                        );
                    } catch (err) {
                        if (err instanceof ExportError) {
                            res.send(400, err.message);
                            return;
                        } else {
                            throw err;
                        }
                    }
                    break;
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
                default:
                    res.send(400, 'Unknown event');
                    return;
            }

            res.send(204);
            return;
        } catch (err) {
            if (err instanceof OperationNotAllowedError) {
                logger.warn(`Operation not allowed: ${err.message}`);
                res.send(204);
                return;
            }

            throw err;
        }
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
}
