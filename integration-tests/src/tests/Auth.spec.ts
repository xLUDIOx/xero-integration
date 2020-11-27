import { expect } from 'chai';
import { HttpError } from 'restify-errors';

import { ITokenSet, SCHEMA } from '@shared';
import { httpClient, sendResponse, XERO_API_PREFIX, xeroClientMock, XeroDbClient } from '@utils';

describe('Auth tests', () => {
    const authCode = '123456';
    const accountId = 'demo_gmbh_1';
    const returnUrl = '/my-url';

    it('redirects to consent URL', async () => {
        const result = await httpClient.get(`/connect?accountId=${encodeURIComponent(accountId)}&returnUrl=${encodeURIComponent(returnUrl)}`);

        expect(result.status).to.eq(302);
        expect(result.headers.location).to.eq('http://xero-integration-service-tests:8081/identity/connect/authorize?response_type=code&client_id=client_id&redirect_uri=https%3A%2F%2Fxero-adapter-test.payhawk.io%2Fcallback&scope=my-scope&state=YWNjb3VudElkPWRlbW9fZ21iaF8xJnJldHVyblVybD0lMkZteS11cmw%3D');
    });

    it('exchanges auth code for access token', async () => {
        xeroClientMock.addRequestListener(async (req, res) => {
            switch (req.url) {
                case `${XERO_API_PREFIX}/Organisations`:
                    sendResponse(res, { Organisations: [organisationMock] });
                    break;
                case `/connections`:
                    sendResponse(res, singleTenantResponseMock);
                    break;
                case `/connect/token`:
                    sendResponse(res, tokenMock);
                    break;
                default:
                    res.writeHead(500);
                    res.end();
                    break;
            }
        });

        const state = Buffer.from(`accountId=${accountId}&returnUrl=${returnUrl}`, 'utf8').toString('base64');
        const result = await httpClient.get(`/callback?code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(state)}`);
        expect(result.status).to.eq(302);
        expect(result.headers.location).to.eq('http://localhost:3000/my-url?connection=xero&label=My+Org');

        const tokenRecord = await XeroDbClient.getAccessTokenForAccount(accountId);
        expect(tokenRecord).not.to.eq(undefined);
        expect(tokenRecord.tenant_id).to.eq(singleTenantResponseMock[0].tenantId);
        expect(tokenRecord.user_id).to.eq(xeroUserId);

        expect(xeroClientMock.requests).to.have.lengthOf(5);
    });

    it('throws error if another active account uses same tenant ID', async () => {
        xeroClientMock.addRequestListener(async (req, res) => {
            switch (req.url) {
                case `/connect/token`:
                    sendResponse(res, tokenMock);
                    break;
                case `/connections`:
                    sendResponse(res, singleTenantResponseMock);
                    break;
                default:
                    res.writeHead(500);
                    res.end();
                    break;
            }
        });

        const secondAccountId = `${accountId}_other`;

        const state = Buffer.from(`accountId=${secondAccountId}&returnUrl=${returnUrl}`, 'utf8').toString('base64');
        const result = await httpClient.get(`/callback?code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(state)}`);
        expect(result.status).to.eq(500);

        const error: HttpError = result.data;
        expect(error.message).to.include('Another active account already uses the same tenant ID');

        const tokenRecord = await XeroDbClient.getAccessTokenForAccount(secondAccountId);
        expect(tokenRecord).to.eq(undefined);

        expect(xeroClientMock.requests).to.have.lengthOf(2);
    });

    it('does not throw error if another demo account uses same tenant ID', async () => {
        xeroClientMock.addRequestListener(async (req, res) => {
            switch (req.url) {
                case `${XERO_API_PREFIX}/Organisations`:
                    sendResponse(res, { Organisations: [organisationMock] });
                    break;
                case `/connections`:
                    sendResponse(res, singleTenantResponseMock);
                    break;
                case `/connect/token`:
                    sendResponse(res, tokenMock);
                    break;
                default:
                    res.writeHead(500);
                    res.end();
                    break;
            }
        });

        const secondAccountId = `${accountId}_demo`;

        const state = Buffer.from(`accountId=${secondAccountId}&returnUrl=${returnUrl}`, 'utf8').toString('base64');
        const result = await httpClient.get(`/callback?code=${encodeURIComponent(authCode)}&state=${encodeURIComponent(state)}`);
        expect(result.status).to.eq(302);
        expect(result.headers.location).to.eq('http://localhost:3000/my-url?connection=xero&label=My+Org');

        const tokenRecord = await XeroDbClient.getAccessTokenForAccount(secondAccountId);
        expect(tokenRecord).not.to.eq(undefined);
        expect(tokenRecord.tenant_id).to.eq(singleTenantResponseMock[0].tenantId);
        expect(tokenRecord.user_id).to.eq(xeroUserId);

        expect(xeroClientMock.requests).to.have.lengthOf(5);
    });

    before(async () => {
        await Promise.all(
            [SCHEMA.TABLE_NAMES.ACCESS_TOKENS, SCHEMA.TABLE_NAMES.PAYHAWK_API_KEYS]
                .map(t => XeroDbClient.cleanupTable(t)),
        );
    });
});

const xeroUserId = '00000000-0000-0000-0000-000000000000';
const fakeAccessToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJuYmYiOjE1ODkzNjMwMjMsImV4cCI6MTYwNTEwMzU0MCwiaXNzIjoiaHR0cHM6Ly9pZGVudGl0eS54ZXJvLmNvbSIsImF1ZCI6Imh0dHBzOi8vaWRlbnRpdHkueGVyby5jb20vcmVzb3VyY2VzIiwiY2xpZW50X2lkIjoiOTFFNTcxNUIxMTk5MDM4MDgwRDZEMDI5NkVCQzE2NDgiLCJzdWIiOiJhM2E0ZGJhZmgzNDk1YTgwOGVkN2E3Yjk2NDM4OGY1MyIsImF1dGhfdGltZSI6MTU4OTM2MTg5MiwieGVyb191c2VyaWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJnbG9iYWxfc2Vzc2lvbl9pZCI6ImFjMjIwMjU3NWU4MjRhZjNhMTgxYzUwZmNhYTY1YzNjIiwianRpIjoiNGU3NzQ3Y2VjNGNlNTRkNjUxMmI0YjA3NzUxNjZjNWYiLCJhdXRoZW50aWNhdGlvbl9ldmVudF9pZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCIsInNjb3BlIjpbImVtYWlsIiwicHJvZmlsZSIsIm9wZW5pZCIsImFjY291bnRpbmcudHJhbnNhY3Rpb25zIiwiYWNjb3VudGluZy5zZXR0aW5ncyIsIm9mZmxpbmVfYWNjZXNzIl0sImlhdCI6MTYwNTA5OTk0MH0.94aX410SeQ7SuFOaIXAyVBD5Pb8uULoNTcO0_92_rjM';

const tokenMock: Partial<ITokenSet> = {
    access_token: fakeAccessToken,
    expires_in: 1800,
    refresh_token: 'refresh_token',
};

const singleTenantResponseMock = [{
    id: 'connection-id',
    tenantId: 'tenant-id',
    tenantName: 'My Org',
}];

const organisationMock = {
    name: singleTenantResponseMock[0].tenantName,
};
