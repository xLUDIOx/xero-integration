import { expect } from 'chai';

import { ITaxRate, ITokenSet, PayhawkEvent, SCHEMA, TaxRateStatus } from '@shared';
import { payhawkClientMock, sendResponse, XERO_API_PREFIX, xeroClientMock, XeroDbClient, XeroServiceClient } from '@utils';

describe('Synchronize Tax Rates', () => {
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

    it('pushes tax rates to Payhawk', async () => {
        const taxRate: ITaxRate = {
            name: 'Tax on purchases',
            taxType: 'TAX001',
            effectiveRate: '15.0000',
            status: TaxRateStatus.Active,
        };

        // cspell: disable
        xeroClientMock.addRequestListener(async (req, res) => {
            switch (req.url) {
                case `${XERO_API_PREFIX}/TaxRates?where=CanApplyToExpenses%3D%3Dtrue%26%26Status%3D%3D%22ACTIVE%22`:
                    sendResponse(res, { TaxRates: [taxRate] });
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
                case `/api/v2/accounts/${encodeURIComponent(accountId)}/tax-rates`:
                    sendResponse(res, {});
                    break;
                default:
                    res.writeHead(500);
                    res.end();
                    break;
            }
        });

        const response = await XeroServiceClient.sendPayhawkEvent({
            event: PayhawkEvent.TaxRatesSynchronize,
            data: {},
            accountId,
        });

        expect(response.status).to.eq(204);

        expect(xeroClientMock.requests).to.have.lengthOf(1);
        expect(payhawkClientMock.requests).to.have.lengthOf(1);

        const payhawkRequest = payhawkClientMock.requests[0];
        const payhawkRequestBody = payhawkRequest.body;
        expect(payhawkRequestBody).to.deep.eq(
            [taxRate].map(r => ({ name: r.name, rate: Number(r.effectiveRate), code: r.taxType }))
        );

        const payhawkRequestHeaders = payhawkRequest.headers;
        const apiKeyHeader = payhawkRequestHeaders['x-payhawk-apikey'];
        expect(apiKeyHeader).to.eq(apiKey);
    });
});
