// tslint:disable-next-line: no-var-requires
require('module-alias').addAliases({
    '@shared': `${__dirname}/shared`,
    '@utils': `${__dirname}/utils`,
});

import { waitForService } from '@utils';

before(async () => {
    await waitForService();
});
