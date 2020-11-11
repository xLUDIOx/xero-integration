import { expect } from 'chai';

import { httpClient } from '@utils';

describe('Auth tests', () => {
    const accountId = 'demo_gmbh_1';
    const returnUrl = '/my-url';

    it('redirects to consent URL', async () => {
        const result = await httpClient.get(`/connect?accountId=${encodeURIComponent(accountId)}&returnUrl=${encodeURIComponent(returnUrl)}`);

        expect(result.headers.location).to.eq('https://login.xero.com/identity/connect/authorize?response_type=code&client_id=client_id&redirect_uri=https%3A%2F%2Fxero-adapter-test.payhawk.io%2Fcallback&scope=my-scope&state=YWNjb3VudElkPWRlbW9fZ21iaF8xJnJldHVyblVybD0lMkZteS11cmw%3D');
        expect(result.status).to.eq(302);
    });
});
