import { ObjectSerializer, XeroClient } from 'xero-node';

import { DisconnectedRemotelyError, ILogger } from '../../../utils';
import { EntityResponseType, IApiResponse, IErrorResponse, IValidationErrorsItem, IXeroHttpClient, ResponseErrorType } from './IXeroHttpClient';

export class XeroHttpClient implements IXeroHttpClient {
    constructor(
        private readonly inner: XeroClient,
        private readonly logger: ILogger,
    ) { }

    async makeSafeRequest<TResult extends any>(action: (client: XeroClient) => Promise<any>, responseType?: EntityResponseType): Promise<TResult> {
        return this.makeRequest(action, 0, responseType);
    }

    private async makeRequest<TResult extends any>(action: (client: XeroClient) => Promise<any>, retryCount: number, responseType?: EntityResponseType): Promise<TResult> {
        if (retryCount === MAX_RETRIES) {
            throw Error(`Already retried ${MAX_RETRIES} times after rate limit exceeded.`);
        }

        let actionResult;

        try {
            actionResult = await action(this.inner);
        } catch (err) {
            return this.handleFailedRequest(err, action, retryCount, responseType);
        }

        if (!responseType) {
            return actionResult;
        }

        const { response, body } = actionResult as IApiResponse;
        if (!response || !body) {
            throw Error(`No response or body in response data for '${responseType}'`);
        }

        const serializedResponseType = toSerializedEntityResponseType(responseType);
        return body[serializedResponseType];
    }

    private async handleFailedRequest<TResult>(err: any, action: (client: XeroClient) => Promise<any>, retryCount: number, responseType?: EntityResponseType): Promise<TResult> {
        const errorResponseData = err as IApiResponse;
        if (errorResponseData.response) {
            const statusCode = errorResponseData.response.statusCode;
            switch (statusCode) {
                case 400:
                    if (!responseType) {
                        throw err;
                    }

                    let errorBody: any = (errorResponseData.response as IErrorResponse).body;
                    if (errorBody.Type === ResponseErrorType.Validation) {
                        try {
                            const failedItemsDeserialized = ObjectSerializer.deserialize(
                                {
                                    [responseType.toString()]: errorBody.Elements,
                                },
                                responseType.toString(),
                            );

                            const serializedResponseType = toSerializedEntityResponseType(responseType);
                            const failedItems = failedItemsDeserialized[serializedResponseType] as any[];
                            const failedItem = failedItems[0] as IValidationErrorsItem;
                            if (failedItem && failedItem.validationErrors) {
                                errorBody = failedItem.validationErrors;
                            }
                            // tslint:disable-next-line: no-empty
                        } catch (err) {
                        }
                    }

                    const errorMessage = JSON.stringify(errorBody, undefined, 2);
                    throw Error(errorMessage);
                case 403:
                    throw new DisconnectedRemotelyError();
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

                    this.logger.info(`Rate limit exceeded. Retrying again after ${secondsToRetryAfter} seconds (${nextRetryCount})`);

                    return new Promise((resolve, reject) => {
                        const handledRetry = () =>
                            this.makeRequest<TResult>(action, nextRetryCount)
                                .then(resolve, reject);

                        setTimeout(handledRetry, millisecondsToRetryAfter);
                    });
                default:
                    throw Error(JSON.stringify(err, undefined, 2));
            }
        }

        throw err;
    }
}

function toSerializedEntityResponseType(responseType: EntityResponseType): string {
    return responseType[0].toLowerCase() + responseType.slice(1);
}

const MAX_RETRIES = 3;
const DEFAULT_SECONDS_TO_RETRY_AFTER = 1;
