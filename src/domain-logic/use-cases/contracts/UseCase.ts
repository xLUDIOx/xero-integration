import { IResult } from '@utils';

export abstract class UseCase<TRequest, TResult> {
    abstract invoke(request?: TRequest): Promise<IResult<TResult, string> | TResult>;
}
