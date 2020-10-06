import { IMock, It, Mock, Times } from 'typemoq';

import { IXeroHttpClient } from '../http';
import { buildAccessTokenData } from './Auth';

describe('Auth', () => {
    const xeroMock: IMock<IXeroHttpClient> = Mock.ofType<IXeroHttpClient>();

    afterEach(() => {
        xeroMock.verifyAll();
        xeroMock.reset();
    });

    it('should build token data with correct tenant id', async () => {
        const tenants: any[] = [{
            id: '1',
        }, {
            id: '2',
        }];

        xeroMock
            .setup(x => x.makeClientRequest(It.isAny()))
            .returns(async () => tenants)
            .verifiable(Times.once());

        const data = await buildAccessTokenData(xeroMock.object, token, '2');
        expect(data.tenantId).toEqual('2');
    });
});

// cspell: disable-next-line
const token: any = { access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' };
