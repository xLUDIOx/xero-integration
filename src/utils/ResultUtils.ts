export type IResult<Result, ErrorCode> = ISuccessResult<Result> | IErrorResult<ErrorCode>;

export interface IErrorResult<ErrorCode> {
    result?: undefined;
    error: IError<ErrorCode>;
}

export interface ISuccessResult<Result> {
    result: Result;
    error?: undefined;
}

export interface IError<ErrorCode> {
    message: string;
    code: ErrorCode;

    /** Additional information that can be added to logger search indexes then logging an error. */
    logIndexes?: { [key: string]: any };
}

export const createErrorResult = <ErrorCode>(code: ErrorCode, message?: string, logIndexes?: { [key: string]: any }): IErrorResult<ErrorCode> => ({
    error: {
        code,
        message: message === undefined ? `${code}` : message,
        logIndexes,
    },
});

export const createSuccessResult = <T>(result: T): ISuccessResult<T> => ({
    result,
});

export const createVoidResult = (): ISuccessResult<void> => ({
    result: undefined,
});
