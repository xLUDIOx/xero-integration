export class HttpError extends Error {
    code: number;
    requestData: any;
    responseData: any;

    constructor({ message, code, requestData, responseData }: IHttpErrorParams) {
        super(message);

        this.name = this.constructor.name;
        this.code = code;
        this.requestData = requestData;
        this.responseData = responseData;

        Error.captureStackTrace(this, this.constructor);
    }
}

export interface IHttpErrorParams {
    message: string;
    code: number;
    requestData: any;
    responseData: any;
}
