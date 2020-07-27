import * as crypto from 'crypto';

import { Headers } from 'request';
import * as request from 'request-promise';
import { v4 as createUuid } from 'uuid';

import { IApiStore, IMigratedAuthTokenSet, IMigrationRequestData } from './contracts';

export class ApiStore implements IApiStore {
    async migrateToken({ accessToken, clientId, clientSecret, scope, consumerKey, privateKey }: IMigrationRequestData): Promise<IMigratedAuthTokenSet> {
        const result = await this.send(
            {
                'Authorization': this.buildAuthorizationHeader(accessToken, consumerKey, privateKey),
                'Content-Type': 'application/json',
            },
            {
                client_id: clientId,
                client_secret: clientSecret,
                scope,
            });

        return result;
    }

    private async send(reqHeaders: Headers, reqBody: any): Promise<IMigratedAuthTokenSet> {
        return new Promise((resolve, reject) => {
            request(
                `${MIGRATION_ENDPOINT}?tenantType=${TENANT_TYPE}`,
                {
                    method: HTTP_METHOD,
                    headers: reqHeaders,
                    body: reqBody,
                    json: true,
                })
                .then(resolve)
                .catch(reject);
        });
    }

    private buildAuthorizationHeader(accessToken: string, consumerKey: string, privateKey: string) {
        const nonce = createUuid();
        const timestamp = Math.round(new Date().getTime() / 1000).toString();
        const baseSignatureString = generateBaseSignatureString(accessToken, consumerKey, nonce, timestamp);
        const signatureString = this.sign(baseSignatureString, privateKey);

        const oauthParams = [
            `oauth_consumer_key='${consumerKey}'`,
            `oauth_token='${accessToken}'`,
            `oauth_signature_method='${SIGNATURE_METHOD}'`,
            `oauth_signature='${signatureString}'`,
            `oauth_timestamp='${timestamp}'`,
            `oauth_nonce='${nonce}'`,
            `oauth_version='1.0'`,
        ];

        const headerValue = `OAuth ${oauthParams.join(', ')}`;
        return headerValue;
    }

    private sign(text: string, privateKey: string): string {
        const signatureFactory = crypto.createSign('RSA-SHA1');
        const result = signatureFactory
            .update(text)
            .sign(
                {
                    key: privateKey,
                    format: 'pem',
                    padding: crypto.constants.RSA_PKCS1_PADDING,
                },
                'base64'
            );

        return encodeURIComponent(result);
    }
}

function generateBaseSignatureString(accessToken: string, consumerKey: string, nonce: string, timestamp: string): string {
    const oauthParameters = [
        `oauth_consumer_key=${consumerKey}`,
        `oauth_nonce=${nonce}`,
        `oauth_signature_method=${SIGNATURE_METHOD}`,
        `oauth_timestamp=${timestamp}`,
        `oauth_token=${accessToken}`,
        `oauth_version=1.0`,
        `tenantType=${TENANT_TYPE}`,
    ];

    const parameters = [
        HTTP_METHOD,
        encodeURIComponent(MIGRATION_ENDPOINT),
        encodeURIComponent(oauthParameters.join('&')),
    ];

    const parametersString = parameters.join('&');
    return parametersString;
}

const MIGRATION_ENDPOINT = 'https://api.xero.com/oauth/migrate';
const HTTP_METHOD = 'POST';
const SIGNATURE_METHOD = 'RSA-SHA1';

const TENANT_TYPE = 'ORGANISATION';
