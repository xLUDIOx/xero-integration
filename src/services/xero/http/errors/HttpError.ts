import { BaseError } from './BaseError';

export class HttpError extends BaseError {
    constructor(readonly innerError: Error) {
        super(innerError);
    }
}
