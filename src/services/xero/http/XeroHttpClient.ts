import { Response } from 'request';
import * as request from 'request-promise';
import { StatusCodeError } from 'request-promise/errors';
import { ObjectSerializer, XeroClient } from 'xero-node';

import { ForbiddenError, ILogger } from '../../../utils';
import { EntityResponseType, IApiResponse, IErrorResponse, IXeroHttpClient, ResponseErrorType } from './IXeroHttpClient';

export class XeroHttpClient implements IXeroHttpClient {
    constructor(
        private readonly inner: XeroClient,
        private readonly logger: ILogger,
    ) { }

    private get accessToken(): string {
        const tokenSet = this.inner.readTokenSet();
        const accessToken = tokenSet.access_token;
        if (!accessToken) {
            throw Error('Client has no access token');
        }

        return accessToken;
    }

    async makeClientRequest<TResult extends any>(action: (client: XeroClient) => Promise<any>, responseType?: EntityResponseType): Promise<TResult> {
        return this.makeRequest(action, 0, responseType);
    }

    async makeRawRequest<TResult extends any>(method: string, path: string, tenantId: string, responseType?: EntityResponseType): Promise<TResult> {
        return this.makeClientRequest<TResult>(
            () => makeRawAuthorizedRequest(
                method,
                path,
                tenantId,
                this.accessToken,
                responseType,
            ),
            responseType,
        );
    }

    private async makeRequest<TResult extends any>(action: (client: XeroClient) => Promise<any>, retryCount: number, responseType?: EntityResponseType): Promise<TResult> {
        if (retryCount === MAX_RETRIES) {
            throw Error(`Already retried ${MAX_RETRIES} times after rate limit exceeded.`);
        }

        let actionResult;

        try {
            actionResult = await action(this.inner);
        } catch (err) {
            actionResult = await this.handleFailedRequest(err, action, retryCount, responseType);
            if (!actionResult) {
                return undefined as any;
            }
        }

        if (!responseType) {
            return actionResult;
        }

        const { response, body } = actionResult as IApiResponse;

        if (!response) {
            throw Error(`No error was caught but also no response data was found required by '${responseType}' api request`);
        }

        if (!body) {
            throw Error(`No error was caught but also no response body was found required by '${responseType}'. Status code: ${response.statusCode}`);
        }

        const serializedResponseType = toSerializedEntityResponseType(responseType);
        return body[serializedResponseType];
    }

    private async handleFailedRequest<TResult>(err: any, action: (client: XeroClient) => Promise<any>, retryCount: number, responseType?: EntityResponseType): Promise<TResult> {
        const logger = this.logger.child({ action: action.toString() });

        const errorResponseData = err as IApiResponse;
        if (errorResponseData.response) {
            const statusCode = errorResponseData.response.statusCode;
            switch (statusCode) {
                case 400:
                    if (!responseType) {
                        throw err;
                    }

                    const errorBody = (errorResponseData.response as IErrorResponse).body;

                    let errorObj: any = errorBody;
                    if (errorBody.Type === ResponseErrorType.Validation) {
                        const validationErrors = errorBody.Elements.map(e => e.ValidationErrors).filter(x => x !== undefined);
                        if (validationErrors.length > 0) {
                            errorObj = validationErrors;
                        }
                    }

                    throw createError(action, errorObj);
                case 403:
                    const errBody = errorResponseData.response ?
                        (errorResponseData.response as IErrorResponse).body :
                        errorResponseData;
                    throw createError(action, errBody, m => new ForbiddenError(m));
                case 404:
                    return undefined as any;
                case 429:
                    const headers = errorResponseData.response.headers;
                    const retryAfterHeaderValue = headers['retry-after'];
                    const secondsToRetryAfter = Number(retryAfterHeaderValue) || DEFAULT_SECONDS_TO_RETRY_AFTER;
                    if (secondsToRetryAfter <= 0) {
                        throw Error(`Invalid 'Retry-After' header: '${retryAfterHeaderValue}'`);
                    }

                    const millisecondsToRetryAfter = secondsToRetryAfter * 1000;
                    const nextRetryCount = retryCount + 1;

                    logger.info(`Rate limit exceeded. Retrying again after ${secondsToRetryAfter} seconds (${nextRetryCount})`);

                    return new Promise((resolve, reject) => {
                        const handledRetry = () =>
                            this.makeRequest<TResult>(action, nextRetryCount)
                                .then(d => resolve(d))
                                .catch(e => reject(e));

                        setTimeout(handledRetry, millisecondsToRetryAfter);
                    });
                default:
                    throw createError(action, err);
            }
        }

        throw createError(action, err);
    }
}

async function makeRawAuthorizedRequest(method: string, path: string, tenantId: string, accessToken: string, responseType?: EntityResponseType): Promise<IApiResponse> {
    let body;
    try {
        const response: Response = await request(
            `${BASE_PATH}/${path}`,
            {
                method,
                headers: {
                    [XERO_TENANT_ID_HEADER]: tenantId,
                },
                auth: {
                    bearer: accessToken,
                },
                json: true,
                resolveWithFullResponse: true,
            }
        );

        body = response.body;

        if (response.statusCode && response.statusCode >= 200 && response.statusCode <= 299) {
            if (responseType) {
                body = ObjectSerializer.deserialize(response.body, responseType.toString());
            }

            return { response, body };
        } else {
            throw { response, body };
        }
    } catch (err) {
        const { response, ...error } = err as StatusCodeError;
        throw { response, body: error };
    }
}

function toSerializedEntityResponseType(responseType: EntityResponseType): string {
    return responseType[0].toLowerCase() + responseType.slice(1);
}

function createError(action: any, err: any, errorConstructor: (m?: string) => Error = Error): Error {
    return errorConstructor(JSON.stringify({ action: action.toString(), error: err }, undefined, 2));
}

const BASE_PATH = 'https://api.xero.com/api.xro/2.0';
const XERO_TENANT_ID_HEADER = 'xero-tenant-id';

const MAX_RETRIES = 3;
const DEFAULT_SECONDS_TO_RETRY_AFTER = 1;
