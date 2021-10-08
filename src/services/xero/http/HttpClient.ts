// eslint-disable-next-line import/no-named-as-default
import Axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

import { ILock, ILogger, toBase64 } from '@utils';

import { ForbiddenError, HttpError, IHttpErrorParams, ResourceNotError, UnauthorizedError } from './errors';
import { AUTHORIZATION_HEADER, CONTENT_TYPE_HEADER, HttpStatusCodes, IHttpClient, IRequestOptions, XERO_TENANT_ID_HEADER } from './IHttpClient';

export class HttpClient implements IHttpClient {
    private readonly client: AxiosInstance;

    constructor(
        private readonly accessToken: string | undefined,
        private readonly tenantId: string | undefined,
        private readonly lock: ILock,
        private readonly logger: ILogger,
    ) {
        this.client = Axios.create();
        this.client.interceptors.request.use(async (reqConfig: AxiosRequestConfig) => {
            if (!reqConfig.headers) {
                reqConfig.headers = {};
            }

            if (this.accessToken && !reqConfig.headers[AUTHORIZATION_HEADER]) {
                reqConfig.headers[AUTHORIZATION_HEADER] = `Bearer ${this.accessToken}`;
            }

            return reqConfig;
        });
    }

    async request<TBody = any>(requestOptions: IRequestOptions): Promise<TBody> {
        const { method, url, data } = requestOptions;
        const requestLogger = this.logger.child({ requestOptions: { method, url, data } });

        requestLogger.info('Making a request');

        const result = await this.makeRequest<TBody>(requestOptions, requestLogger);

        const responseLogger = requestLogger.child({ response: result });
        responseLogger.info('Request completed');

        return result;
    }

    private async makeRequest<TBody>({ method, url, authorization, data, contentType, entityResponseType, responseType }: IRequestOptions, logger: ILogger): Promise<TBody> {
        return this._makeSafeRequest<TBody>(
            async () => {
                const requestHeaders: Record<string, string> = {};

                if (this.tenantId) {
                    requestHeaders[XERO_TENANT_ID_HEADER] = this.tenantId;
                }

                if (contentType) {
                    requestHeaders[CONTENT_TYPE_HEADER] = contentType;
                }

                if (authorization) {
                    if (authorization.basic) {
                        const { user, secret } = authorization.basic;
                        if (user.length > 0 && secret.length > 0) {
                            requestHeaders[AUTHORIZATION_HEADER] = `Basic ${toBase64(`${user}:${secret}`)}`;
                        }
                    } else if (authorization.authToken.length > 0) {
                        requestHeaders[AUTHORIZATION_HEADER] = `Bearer ${authorization.authToken}`;
                    }
                }

                const response = await this.client.request({
                    url,
                    method,
                    data,
                    headers: requestHeaders,
                    responseType,
                });

                if (response.data.error) {
                    throw new HttpError(response.data.error);
                }

                if (entityResponseType) {
                    return response.data[entityResponseType];
                }

                return response.data;
            },
            logger,
            0,
        );
    }

    private async _makeSafeRequest<TResult>(action: () => Promise<TResult>, logger: ILogger, retryCount: number): Promise<TResult> {
        if (retryCount === MAX_RETRIES) {
            throw Error(`Already retried ${MAX_RETRIES} times after rate limit exceeded.`);
        }

        let actionResult;

        try {
            if (retryCount === 0) {
                await this.lock.acquire();
            }

            actionResult = await action();
        } catch (err) {
            if (Axios.isAxiosError(err)) {
                actionResult = await this._handleFailedRequest(err, action, logger, retryCount);
                if (!actionResult) {
                    return undefined as any;
                }
            }

            throw err;
        } finally {
            await this.lock.release();
        }

        return actionResult;
    }

    private async _handleFailedRequest<TResult>(err: AxiosError, action: () => Promise<TResult>, logger: ILogger, retryCount: number): Promise<TResult> {
        const statusCode = err.response?.status;
        const baseError: IHttpErrorParams = {
            message: err.message,
            code: statusCode || HttpStatusCodes.InternalError,
            responseData: err.response?.data,
            requestData: err.request,
        };

        if (!err.response) {
            throw new HttpError(baseError);
        }

        switch (statusCode) {
            case HttpStatusCodes.Unauthorized:
                throw new UnauthorizedError(baseError);
            case HttpStatusCodes.Forbidden:
                throw new ForbiddenError(baseError);
            case HttpStatusCodes.NotFound:
                throw new ResourceNotError(baseError);
            case HttpStatusCodes.TooManyRequests:
                const headers = err.response.headers;
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
                    throw logger.error(Error(`Invalid 'Retry-After' header: '${retryAfterHeaderValue}'`));
                }

                const millisecondsToRetryAfter = secondsToRetryAfter * 1000;
                const nextRetryCount = retryCount + 1;

                logger.info(`Rate limit exceeded. Retrying again after ${secondsToRetryAfter} seconds (${nextRetryCount})`);

                return new Promise((resolve, reject) => {
                    const handledRetry = () =>
                        this._makeSafeRequest<TResult>(action, logger, nextRetryCount)
                            .then(d => resolve(d))
                            .catch(e => reject(e));

                    setTimeout(handledRetry, millisecondsToRetryAfter);
                });
            case HttpStatusCodes.BadRequest:
            default:
                throw new HttpError(baseError);
        }
    }
}

const MAX_RETRIES = 5;
const MIN_SECONDS_TO_WAIT_THRESHOLD = 10;
const DEFAULT_SECONDS_TO_RETRY_AFTER = 60;
