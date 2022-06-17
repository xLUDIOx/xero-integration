import { expect } from 'chai';

import { AccountStatus, IAccountCode, ITokenSet, PayhawkEvent, SCHEMA, TaxType } from '@shared';
import { payhawkClientMock, sendResponse, XERO_API_PREFIX, xeroClientMock, XeroDbClient, XeroServiceClient } from '@utils';

describe('Synchronize Account Codes', () => {
    const accountId = 'demo_gmbh_1';
    const apiKey = 'api-key';

    before(async () => {
        await Promise.all(
            [SCHEMA.TABLE_NAMES.ACCESS_TOKENS, SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS]
                .map(t => XeroDbClient.cleanupTable(t)),
        );

        await XeroServiceClient.sendPayhawkEvent({
            event: PayhawkEvent.ApiKeySet,
            data: {
                apiKey,
            },
            accountId,
        });

        const accountApiKeyRecord = await XeroDbClient.getApiKeyForAccount(accountId);
        expect(accountApiKeyRecord).not.to.eq(undefined);
        expect(accountApiKeyRecord!.key).to.eq(apiKey);

        await XeroDbClient.setAccessTokenForAccount(
            accountId,
            'user_id',
            'tenant_id',
            { access_token: 'access_token', expires_at: Date.now() + 10 * 60 * 1000 } as ITokenSet,
        );

        const tokenRecord = await XeroDbClient.getAccessTokenForAccount(accountId);
        expect(tokenRecord).not.to.eq(undefined);
    });

    it('pushes account codes to Payhawk', async () => {
        const expenseAccountCode: IAccountCode = {
            accountId: '1',
            name: 'General',
            code: '100',
            description: '',
            taxType: TaxType.TaxOnPurchases,
            status: AccountStatus.Active,
            addToWatchlist: true,
        };
        const assetAccountCode: IAccountCode = {
            accountId: '2',
            name: 'Asset',
            code: '101',
            description: '',
            taxType: TaxType.None,
            status: AccountStatus.Active,
            addToWatchlist: true,
        };

        // cspell: disable
        xeroClientMock.addRequestListener(async (req, res) => {
            switch (req.url) {
                case `${XERO_API_PREFIX}/Accounts?where=Class%3D%3D%22EXPENSE%22%26%26Status%3D%3D%22ACTIVE%22`:
                    sendResponse(res, { Accounts: [expenseAccountCode] });
                    break;
                case `${XERO_API_PREFIX}/Accounts?where=Type%3D%3D%22FIXED%22%26%26Status%3D%3D%22ACTIVE%22`:
                    sendResponse(res, { Accounts: [assetAccountCode] });
                    break;
                default:
                    res.writeHead(500);
                    res.end();
                    break;
            }
        });
        // cspell: enable

        payhawkClientMock.addRequestListener(async (req, res) => {
            switch (req.url) {
                case `/api/v2/accounts/${encodeURIComponent(accountId)}/accounting-codes`:
                    sendResponse(res, {});
                    break;
                default:
                    res.writeHead(500);
                    res.end();
                    break;
            }
        });

        const response = await XeroServiceClient.sendPayhawkEvent({
            event: PayhawkEvent.ChartOfAccountSynchronize,
            data: {},
            accountId,
        });

        expect(response.status).to.eq(204);

        expect(xeroClientMock.requests).to.have.lengthOf(2);
        expect(payhawkClientMock.requests).to.have.lengthOf(1);

        const payhawkRequest = payhawkClientMock.requests[0];
        const payhawkRequestBody = payhawkRequest.body;
        expect(payhawkRequestBody).to.deep.eq(
            [expenseAccountCode, assetAccountCode].map(x => ({ name: x.name, defaultTaxCode: x.taxType, code: x.code }))
        );

        const payhawkRequestHeaders = payhawkRequest.headers;
        const apiKeyHeader = payhawkRequestHeaders['x-payhawk-apikey'];
        expect(apiKeyHeader).to.eq(apiKey);
    });
});
