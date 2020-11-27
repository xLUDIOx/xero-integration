import { expect } from 'chai';

import { httpClient } from '@utils';

describe('Service status tests', () => {
    it('returns 200 OK', async () => {
        const result = await httpClient.get('/status');

        expect(result.status).to.eq(200);
        expect(result.data).to.eq('OK');
    });
});
