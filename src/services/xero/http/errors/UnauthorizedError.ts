import { HttpError, IHttpErrorParams } from './HttpError';

export class UnauthorizedError extends HttpError {
    constructor(params: IHttpErrorParams) {
        super(params);
    }
}
