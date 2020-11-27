// tslint:disable-next-line: no-var-requires
require('module-alias').addAliases({
    '@shared': `${__dirname}/shared`,
    '@utils': `${__dirname}/utils`,
});

import { fxRatesClientMock, payhawkClientMock, xeroClientMock, XeroServiceClient } from '@utils';

const clientMocks = [
    payhawkClientMock,
    xeroClientMock,
    fxRatesClientMock,
];

before(async () => {
    await XeroServiceClient.waitForStartup();

    clientMocks.forEach(x => x.open());
});

after(async () => {
    await Promise.all(clientMocks.map(x => x.close()));
});

afterEach(() => {
    clientMocks.forEach(x => x.reset());
});
