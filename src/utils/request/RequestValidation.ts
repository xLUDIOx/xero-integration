import { Next, Request, Response } from 'restify';
import { BadRequestError } from 'restify-errors';

export function requiredQueryParams<TQuery>(...params: (keyof TQuery)[]) {
    // tslint:disable-next-line:only-arrow-functions
    return function (target: any, key: string, descriptor: TypedPropertyDescriptor<(request: Request, response: Response) => Promise<void>> | TypedPropertyDescriptor<(request: Request, response: Response, next: Next) => Promise<void>>): any {
        if (descriptor === undefined) {
            descriptor = Object.getOwnPropertyDescriptor(target, key)!;
        }

        const originalMethod: any = descriptor.value!;

        // tslint:disable-next-line:space-before-function-paren
        descriptor.value = async function (this: any, request: Request, response: Response, next: Next) {
            if (!request.query) {
                throw new BadRequestError('No query parameters provided.');
            }

            for (const param of params) {
                const value = request.query[param];
                if (value === undefined || value === null) {
                    throw new BadRequestError(`Missing required query parameter: ${param}.`);
                }
            }

            // eslint-disable-next-line prefer-rest-params
            return originalMethod.apply(this, arguments);
        } as any;

        return descriptor;
    };
}
