import { RequiredBy } from '@shared';

import { IAccount } from './IAccount';

export type IAuthenticatedAccount = RequiredBy<IAccount, 'accountingSystemAccountId' | 'accountingSystemAccessToken'>;
export type IConnectedAccount = RequiredBy<IAuthenticatedAccount, | 'accountingSystemSubsidiaryId' | 'accountingSystemSubsidiaryCurrency' | 'payhawkApiKey'>;
