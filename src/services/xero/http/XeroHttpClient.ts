import { Headers, Response } from 'request';
import * as request from 'request-promise';
import { StatusCodeError } from 'request-promise/errors';
import { ObjectSerializer, XeroClient } from 'xero-node';

import { ExportError, ForbiddenError, ILock, ILogger } from '@utils';

import { IApiResponse, IErrorResponse, IXeroHttpClient, IXeroRequestOptions, ResponseErrorType, XeroEntityResponseType } from './IXeroHttpClient';

/**
 * @deprecated Use HttpClient instead
 */
export class XeroHttpClient implements IXeroHttpClient {
    constructor(
        private readonly inner: XeroClient,
        private readonly lock: ILock,
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

    async makeClientRequest<TResult>(action: (client: XeroClient) => Promise<any>, responseType?: XeroEntityResponseType): Promise<TResult | undefined> {
        return this.makeRequest(action, 0, responseType);
    }

    async makeRawRequest<TResult>(requestOptions: IXeroRequestOptions, tenantId: string, responseType?: XeroEntityResponseType): Promise<TResult | undefined> {
        return this.makeClientRequest<TResult>(
            () => makeRawAuthorizedRequest(
                requestOptions,
                tenantId,
                this.accessToken,
                responseType,
            ),
            responseType,
        );
    }

    private async makeRequest<TResult>(action: (client: XeroClient) => Promise<any>, retryCount: number, responseType?: XeroEntityResponseType): Promise<TResult | undefined> {
        if (retryCount === MAX_RETRIES) {
            throw Error(`Already retried ${MAX_RETRIES} times after rate limit exceeded.`);
        }

        let actionResult;

        try {
            if (retryCount === 0) {
                await this.lock.acquire();
            }

            actionResult = await action(this.inner);

        } catch (err) {
            actionResult = await this.handleFailedRequest(err, action, retryCount, responseType);
            if (!actionResult) {
                return undefined;
            }
        } finally {
            await this.lock.release();
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
        return body[serializedResponseType] || body[DEFAULT_RESPONSE_TYPE];
    }

    private async handleFailedRequest<TResult>(err: any, action: (client: XeroClient) => Promise<any>, retryCount: number, responseType?: XeroEntityResponseType): Promise<TResult | undefined> {
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

                    const errorObj = errorBody;
                    if (errorBody.Type === ResponseErrorType.Validation) {
                        const validationErrors = errorBody.Elements.flatMap(e => e.ValidationErrors ?? []);
                        if (validationErrors.length > 0) {
                            logger.child({ errors: validationErrors }).info('Validation errors occurred.');
                            const validationError = validationErrors[0].message ?? (validationErrors[0] as { Message: string }).Message;
                            throw new ExportError(`Export into Xero failed. ${validationError}`); // contract is wrong, it's with capital M
                        }
                    }

                    throw new Error(errorObj.Message);
                case 403:
                    const errBody = errorResponseData.response ?
                        (errorResponseData.response as IErrorResponse).body.Message :
                        errorResponseData.body;
                    throw new ForbiddenError(errBody);
                case 404:
                    return undefined;
                case 429:
                    const headers = errorResponseData.response.headers;
                    const retryAfterHeaderValue = headers['retry-after'];

                    let secondsToRetryAfter = Number(retryAfterHeaderValue);
                    if (!secondsToRetryAfter) {
                        logger.error(Error(`No Retry-After header found. Falling back to default value - ${DEFAULT_SECONDS_TO_RETRY_AFTER}s`));
                        secondsToRetryAfter = DEFAULT_SECONDS_TO_RETRY_AFTER;
                    }

                    if (secondsToRetryAfter < MIN_SECONDS_TO_WAIT_THRESHOLD) {
                        logger.info(`Retry time below threshold. Falling back to default retry time - ${DEFAULT_SECONDS_TO_RETRY_AFTER}`);
                        secondsToRetryAfter = DEFAULT_SECONDS_TO_RETRY_AFTER;
                    }

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
                    throw new Error(err);
            }
        }

        throw new Error(err);
    }
}

async function makeRawAuthorizedRequest({ method, path, body, contentType }: IXeroRequestOptions, tenantId: string, accessToken: string, responseType?: XeroEntityResponseType): Promise<IApiResponse> {
    let resBody;

    try {
        const headers: Headers = {
            [AUTHORIZATION_HEADER]: `Bearer ${accessToken}`,
            [CONTENT_TYPE_HEADER]: contentType,
            [XERO_TENANT_ID_HEADER]: tenantId,
        };

        if (contentType) {
            headers[CONTENT_TYPE_HEADER] = contentType;
        }

        const response: Response = await request({
            uri: `${BASE_PATH}/${path}`,
            method,
            body,
            headers,
            resolveWithFullResponse: true,
        });

        resBody = JSON.parse(response.body);

        if (response.statusCode && response.statusCode >= 200 && response.statusCode <= 299) {
            if (responseType) {
                resBody = ObjectSerializer.deserialize(resBody, responseType.toString());
            }

            return { response, body: resBody };
        } else {
            throw { response, body: resBody };
        }
    } catch (err) {
        if (err instanceof StatusCodeError) {
            const { response, ...error } = err as StatusCodeError;
            throw { response, body: error };
        } else {
            throw err;
        }
    }
}

function toSerializedEntityResponseType(responseType: XeroEntityResponseType): string {
    return responseType[0].toLowerCase() + responseType.slice(1);
}

const DEFAULT_RESPONSE_TYPE = 'items';

const BASE_PATH = 'https://api.xero.com/api.xro/2.0';
const XERO_TENANT_ID_HEADER = 'xero-tenant-id';
const AUTHORIZATION_HEADER = 'authorization';
const CONTENT_TYPE_HEADER = 'content-type';

const MAX_RETRIES = 5;
const MIN_SECONDS_TO_WAIT_THRESHOLD = 10;
const DEFAULT_SECONDS_TO_RETRY_AFTER = 60; // be absolutely sure request should succeed
