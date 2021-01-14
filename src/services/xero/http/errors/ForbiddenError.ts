import { HttpError, IHttpErrorParams } from './HttpError';

export class ForbiddenError extends HttpError {
    constructor(params: IHttpErrorParams) {
        super(params);
    }
}
