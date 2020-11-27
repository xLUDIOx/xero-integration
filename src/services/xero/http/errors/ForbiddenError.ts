import { HttpError } from './HttpError';

export class ForbiddenError extends HttpError {
    constructor(innerError: Error) {
        super(innerError);
    }
}
