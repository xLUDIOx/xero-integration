export abstract class BaseError extends Error {
    constructor(readonly innerError: Error) {
        super(innerError.message);

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
