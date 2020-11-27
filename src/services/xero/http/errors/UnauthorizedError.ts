import { HttpError } from './HttpError';

export class UnauthorizedError extends HttpError {
    constructor(readonly innerError: Error) {
        super(innerError);
    }
}
