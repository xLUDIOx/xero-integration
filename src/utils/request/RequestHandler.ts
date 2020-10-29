import { Next, Request, RequestHandler, Response } from 'restify';

import { createLogger } from '../logger';

const logger = createLogger();

export type AsyncRequestHandler = (req: Request, res: Response, next: Next) => Promise<any>;

export const requestHandler = (asyncHandler: AsyncRequestHandler): RequestHandler => {
    return (req: Request, res: Response, next: Next) => {
        asyncHandler(req, res, next)
            .catch(err => {
                logger.error(err);
                res.send(500);
            });
    };
};
