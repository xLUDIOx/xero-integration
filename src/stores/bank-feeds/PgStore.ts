import { BankFeedConnectionRecordKeys, BankFeedStatementRecordKeys, IBankFeedConnectionRecord, IBankFeedStatementRecord, IDbClient, SCHEMA } from '@shared';

import { IStatementFilter, IStore } from './IStore';

export class PgStore implements IStore {
    private readonly connectionsTableName: string = SCHEMA.TABLE_NAMES.BANK_FEED_CONNECTIONS;
    private readonly statementsTableName: string = SCHEMA.TABLE_NAMES.BANK_FEED_STATEMENTS;

    constructor(private readonly dbClient: IDbClient) {
    }

    async getConnectionIdByCurrency(accountId: string, currency: string): Promise<string | undefined> {
        const result = await this.dbClient.query<Pick<IBankFeedConnectionRecord, 'bank_connection_id'>>({
            text: `
                SELECT "${BankFeedConnectionRecordKeys.bank_connection_id}"
                FROM ${this.connectionsTableName}
                WHERE "${BankFeedConnectionRecordKeys.account_id}"=$1 AND
                    UPPER("${BankFeedConnectionRecordKeys.currency}")=$2
            `,
            values: [
                accountId,
                currency.toUpperCase(),
            ],
        });

        if (result.rows.length === 0) {
            return undefined;
        }

        return result.rows[0].bank_connection_id;
    }

    async getConnectionIdsForAccount(accountId: string): Promise<string[]> {
        const result = await this.dbClient.query<Pick<IBankFeedConnectionRecord, 'bank_connection_id'>>({
            text: `
                SELECT "${BankFeedConnectionRecordKeys.bank_connection_id}"
                FROM ${this.connectionsTableName}
                WHERE "${BankFeedConnectionRecordKeys.account_id}"=$1
            `,
            values: [
                accountId,
            ],
        });

        return result.rows.map(r => r.bank_connection_id);
    }

    async deleteConnectionForAccount(accountId: string, connectionId: string) {
        await this.dbClient.query({
            text: `
                DELETE FROM ${this.connectionsTableName}
                WHERE "${BankFeedConnectionRecordKeys.account_id}"=$1 AND
                    "${BankFeedConnectionRecordKeys.bank_connection_id}"=$2
            `,
            values: [
                accountId,
                connectionId,
            ],
        });
    }

    async createConnection(
        {
            account_id,
            bank_connection_id,
            currency,
        }: IBankFeedConnectionRecord,
    ): Promise<string> {
        const result = await this.dbClient.query<Pick<IBankFeedConnectionRecord, 'bank_connection_id'>>({
            text: `
                INSERT INTO ${this.connectionsTableName} (
                    "${BankFeedConnectionRecordKeys.account_id}",
                    "${BankFeedConnectionRecordKeys.bank_connection_id}",
                    "${BankFeedConnectionRecordKeys.currency}"
                )
                VALUES ($1, $2, $3)
                RETURNING "${BankFeedConnectionRecordKeys.bank_connection_id}"
            `,
            values: [
                account_id,
                bank_connection_id,
                currency,
            ],
        });

        if (result.rows.length === 0) {
            throw Error('Failed to create bank feed connection record');
        }

        return result.rows[0].bank_connection_id;
    }

    async getStatementByEntityId({ account_id, xero_entity_id, payhawk_entity_id, payhawk_entity_type }: IStatementFilter): Promise<string | undefined> {
        const result = await this.dbClient.query<Pick<IBankFeedStatementRecord, 'bank_statement_id'>>({
            text: `
                SELECT "${BankFeedStatementRecordKeys.bank_statement_id}"
                FROM ${this.statementsTableName}
                WHERE "${BankFeedStatementRecordKeys.account_id}"=$1 AND
                    "${BankFeedStatementRecordKeys.xero_entity_id}"=$2 AND
                    "${BankFeedStatementRecordKeys.payhawk_entity_id}"=$3 AND
                    "${BankFeedStatementRecordKeys.payhawk_entity_type}"=$4
            `,
            values: [
                account_id,
                xero_entity_id,
                payhawk_entity_id,
                payhawk_entity_type,
            ],
        });

        const statementId = result.rows.length === 0 ? undefined : result.rows[0].bank_statement_id;
        return statementId;
    }

    async deleteStatementByEntityId({ bank_statement_id, account_id, xero_entity_id, payhawk_entity_id, payhawk_entity_type }: Required<IStatementFilter>): Promise<void> {
        await this.dbClient.query({
            text: `
                DELETE FROM ${this.statementsTableName}
                WHERE "${BankFeedStatementRecordKeys.bank_statement_id}"=$1 AND
                    "${BankFeedStatementRecordKeys.account_id}"=$2 AND
                    "${BankFeedStatementRecordKeys.xero_entity_id}"=$3 AND
                    "${BankFeedStatementRecordKeys.payhawk_entity_id}"=$4 AND
                    "${BankFeedStatementRecordKeys.payhawk_entity_type}"=$5
            `,
            values: [
                bank_statement_id,
                account_id,
                xero_entity_id,
                payhawk_entity_id,
                payhawk_entity_type,
            ],
        });
    }

    async createStatement(
        {
            account_id,
            xero_entity_id,
            payhawk_entity_id,
            payhawk_entity_type,
            bank_statement_id,
        }: IBankFeedStatementRecord,
    ): Promise<void> {
        const result = await this.dbClient.query({
            text: `
                INSERT INTO ${this.statementsTableName} (
                    "${BankFeedStatementRecordKeys.account_id}",
                    "${BankFeedStatementRecordKeys.xero_entity_id}",
                    "${BankFeedStatementRecordKeys.payhawk_entity_id}",
                    "${BankFeedStatementRecordKeys.payhawk_entity_type}",
                    "${BankFeedStatementRecordKeys.bank_statement_id}"
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `,
            values: [
                account_id,
                xero_entity_id,
                payhawk_entity_id,
                payhawk_entity_type,
                bank_statement_id,
            ],
        });

        if (result.rows.length === 0) {
            throw Error('Failed to create bank statement record');
        }
    }
}
