import { Next, Request, RequestHandler, Response } from 'restify';
import { HttpError, InternalServerError } from 'restify-errors';

import { createLogger, LoggedError } from '../logger';

const logger = createLogger();

export type AsyncRequestHandler = (req: Request, res: Response, next: Next) => Promise<any>;

export const requestHandler = (asyncHandler: AsyncRequestHandler): RequestHandler => {
    return (req: Request, res: Response, next: Next) => {
        asyncHandler(req, res, next)
            .catch(err => {
                if (err instanceof HttpError) {
                    next(err);
                } else if (process.env.TESTING === 'true') {
                    next(new InternalServerError(err));
                } else if (!(err instanceof LoggedError)) {
                    logger.error(err);
                }

                next(new InternalServerError());
            });
    };
};
