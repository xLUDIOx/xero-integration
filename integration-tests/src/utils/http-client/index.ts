// eslint-disable-next-line import/no-named-as-default
import Axios from 'axios';
import { HttpError } from 'restify-errors';

import { IPayhawkPayload } from '@shared';

const MAX_ATTEMPTS = 5;
const DELAY = 3000;
export const SERVICE_URL = 'http://xero-integration-service:8080';

export const httpClient = Axios.create({
    baseURL: SERVICE_URL,
    maxRedirects: 0,
    validateStatus: () => true,
});

export const XeroServiceClient = Object.freeze({
    waitForStartup: async () => {
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            try {
                const result = await httpClient.get('/status');
                if (result.status === 200) {
                    return;
                } else {
                    throw new HttpError({ statusCode: result.status, message: result.statusText });
                }
            } catch (err) {
                await sleep(DELAY);
            }
        }

        throw Error('Unable to connect to Xero integration service');
    },
    sendPayhawkEvent: async (payload: IPayhawkPayload) => {
        const result = await httpClient.post('/payhawk', payload);
        return result;
    },
});

async function sleep(timeout: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
}
