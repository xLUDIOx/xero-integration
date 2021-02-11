import { config } from '../Config';
import { Integration, XeroConnection } from '../managers';
import { createLogger } from '../utils';
import { AuthController } from './AuthController';
import { IntegrationsController } from './IntegrationsController';

export { AuthController, IntegrationsController };

export const createAuth = () => {
    const logger = createLogger();
    return new AuthController(XeroConnection.createManager, config, logger);
};

export const createIntegrations = () => {
    const logger = createLogger();
    return new IntegrationsController(XeroConnection.createManager, Integration.createManager, logger);
};
