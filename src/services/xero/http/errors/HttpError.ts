export class HttpError extends Error {
    code: number;
    data: any;

    constructor({ message, code, data }: IHttpErrorParams) {
        super(message);

        this.name = this.constructor.name;
        this.code = code;
        this.data = data;

        Error.captureStackTrace(this, this.constructor);
    }
}

export interface IHttpErrorParams {
    message: string;
    code: number;
    data: any;
}
