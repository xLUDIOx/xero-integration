import { HttpError, IHttpErrorParams } from './HttpError';

export class ResourceNotError extends HttpError {
    constructor(params: IHttpErrorParams) {
        super(params);
    }
}
