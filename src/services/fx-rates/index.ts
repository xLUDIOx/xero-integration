import * as FxRatesClient from './client';
import { IService } from './IService';
import { Service } from './Service';

export * from './IService';

export const createService: () => IService = () => new Service(FxRatesClient.create());
