import { ILogger } from '@utils';

import { IPayhawkGateway } from './IPayhawkGateway';

export interface IPayhawkGatewayParams {
    payhawkAccountId: string;
    payhawkApiKey: string;
}

export type IPayhawkGatewayFactory = (params: IPayhawkGatewayParams, logger: ILogger) => IPayhawkGateway;
