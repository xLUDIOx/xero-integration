import { HttpError } from './HttpError';

export class ResourceNotError extends HttpError {
    constructor(readonly innerError: Error) {
        super(innerError);
    }
}
