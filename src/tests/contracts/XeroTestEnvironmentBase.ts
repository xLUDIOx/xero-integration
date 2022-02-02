import { Request, Response } from 'restify';
import * as TypeMoq from 'typemoq';
import { AccountingApi, XeroClient } from 'xero-node';

import { AccessTokens, ApiKeys, ISchemaStore } from '@data-access';
import { IEnvironment } from '@environment';
import { Integration, XeroConnection, XeroEntities } from '@managers';
import { Payhawk, Xero } from '@services';
import { PayhawkEvent } from '@shared';
import { ExportError, IDocumentSanitizer, ILock, ILogger } from '@utils';
import { IntegrationsController } from '@web-api';

import { AccountingClient, AuthClient, BankFeedsClient } from '../../services/xero';

export abstract class XeroTestEnvironmentBase {
    private readonly accessTokensStore = TypeMoq.Mock.ofType<AccessTokens.IStore>();
    private readonly apiKeysStore = TypeMoq.Mock.ofType<ApiKeys.IStore>();

    protected readonly payhawkAccountId = 'acc_id';
    protected readonly xeroTenantId = 'tenant_id';
    protected readonly accountingXeroApiMock = TypeMoq.Mock.ofType<AccountingApi>();
    protected readonly httpClientMock = TypeMoq.Mock.ofType<Xero.IHttpClient>();
    protected readonly payhawkClientMock = TypeMoq.Mock.ofType<Payhawk.IClient>();
    protected readonly controller: IntegrationsController;

    private readonly mocks: TypeMoq.IMock<any>[] = [
        this.httpClientMock,
        this.payhawkClientMock,
    ];

    constructor() {
        this.controller = this.createIntegrationsController();
    }

    setupContactsByNameResponseMock(name: string) {
        this.accountingXeroApiMock
            .setup(x => x.getContacts(this.xeroTenantId, undefined, `name.toLower()=="${name.toLowerCase()}"`))
            .returns(async () => getContactsResponse())
            .verifiable(TypeMoq.Times.once());
    }

    setupOrganisationResponseMock() {
        this.httpClientMock
            .setup(x => x.request(TypeMoq.It.isObjectWith({
                url: 'http://xero-api/api.xro/2.0/Organisations',
                method: 'GET',
            })))
            .returns(async () => getOrganisationResponse())
            .verifiable(TypeMoq.Times.once());
    }

    setupDefaultExpenseAccountsResponseMock() {
        this.httpClientMock
            .setup(x => x.request(TypeMoq.It.isObjectWith({
                url: 'http://xero-api/api.xro/2.0/Accounts?where=Class%3D%3D%22EXPENSE%22',
                method: 'GET',
            })))
            .returns(async () => ({
                Accounts: [{
                    name: 'Payhawk General',
                    code: '999999',
                    status: 'ACTIVE',
                }, {
                    name: 'Fees',
                    code: '888888',
                    status: 'ACTIVE',
                }],
            }))
            .verifiable(TypeMoq.Times.once());
    }

    setupCurrencyResponseMock(currency: string) {
        this.accountingXeroApiMock
            .setup(x => x.getCurrencies(this.xeroTenantId, `code=="${currency}"`))
            .returns(async () => ({
                response: {},
                body: {
                    currencies: [{
                        code: currency,
                    }],
                },
            } as any));
    }

    setupBankAccountsResponseMock(currency: string) {
        this.accountingXeroApiMock
            .setup(x => x.getAccounts(this.xeroTenantId, undefined, `type=="BANK"`))
            .returns(async () => ({
                response: {},
                body: {
                    accounts: [{
                        name: `Payhawk ${currency}`,
                        code: `PHWK-${currency}`,
                    }],
                },
            } as any));
    }

    setupValidAccessToken() {
        this.accessTokensStore
            .setup(x => x.getByAccountId(this.payhawkAccountId))
            .returns(async () => ({
                account_id: this.payhawkAccountId,
                tenant_id: this.xeroTenantId,
                token_set: { access_token: 'abc', expires_at: new Date(Date.now() + 100000), expires_in: 100000 },
            } as any));
    }

    setupApiKey() {
        this.apiKeysStore
            .setup(x => x.getByAccountId(this.payhawkAccountId))
            .returns(async () => 'api_key');
    }

    async exportExpense(expenseId: string) {
        try {
            const req = TypeMoq.Mock.ofType<Request>();
            const res = TypeMoq.Mock.ofType<Response>();

            req.setup(r => r.body).returns(() => ({
                accountId: this.payhawkAccountId,
                event: PayhawkEvent.ExpenseExport,
                data: {
                    expenseId,
                },
            }));

            res.setup(r => r.send(204))
                .verifiable(TypeMoq.Times.once());

            this.mocks.push(res);

            return await this.controller.handlePayhawkEvent(req.object, res.object);
        } catch (err) {
            if (err instanceof ExportError) {
                throw err.innerError;
            }

            throw err;
        }
    }

    verifyAndReset() {
        this.mocks.forEach(mock => {
            mock.verifyAll();
            mock.reset();
        });
    }

    private createIntegrationsController() {
        const payhawkPortalUrl = 'http://portal-payhawk.test.test';
        const xeroConfig: Xero.IXeroClientConfig = {
            clientId: 'c_id',
            clientSecret: 'c_secret',
            redirectUris: ['http://xero-redirect'],
            scopes: ['accounting', 'offline_access'],
            state: 'test',
        };

        const env: IEnvironment = {
            xeroApiUrl: 'http://xero-api',
            xeroAuthUrl: 'http://xero-auth',
            xeroLoginUrl: 'http://xero-login',
            fxRatesApiKey: 'fx-key',
            fxRatesApiUrl: 'http://fx-api',
        };

        const schemaStoreMock = TypeMoq.Mock.ofType<ISchemaStore>();
        const xeroClientMock = TypeMoq.Mock.ofType<XeroClient>();
        const documentSanitizerMock = TypeMoq.Mock.ofType<IDocumentSanitizer>();
        const lockMock = TypeMoq.Mock.ofType<ILock>();
        const loggerMock = TypeMoq.Mock.ofType<ILogger>();

        loggerMock
            .setup(l => l.child(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => loggerMock.object);

        loggerMock
            .setup(l => l.error(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((err) => err);

        loggerMock
            .setup(l => l.warn(TypeMoq.It.isAny()))
            .returns((err) => err);

        xeroClientMock
            .setup(x => x.accountingApi)
            .returns(() => this.accountingXeroApiMock.object);

        this.mocks.push(
            schemaStoreMock,
            xeroClientMock,
            documentSanitizerMock,
            lockMock,
            loggerMock,
        );

        const integrationsManager = new Integration.Manager(
            this.payhawkAccountId,
            this.xeroTenantId,
            payhawkPortalUrl,
            schemaStoreMock.object,
            new XeroEntities.Manager(
                new Xero.Client(
                    AuthClient.create(this.httpClientMock.object, xeroConfig, loggerMock.object, env),
                    AccountingClient.create(this.httpClientMock.object, loggerMock.object, env),
                    BankFeedsClient.create(this.httpClientMock.object, loggerMock.object, env),
                    Xero.createXeroHttpClient(xeroClientMock.object, lockMock.object, loggerMock.object),
                    this.xeroTenantId,
                    documentSanitizerMock.object,
                    loggerMock.object
                ),
                loggerMock.object
            ),
            this.payhawkClientMock.object,
            async () => { /** */ },
            loggerMock.object
        );

        schemaStoreMock
            .setup(x => x.accessTokens)
            .returns(() => this.accessTokensStore.object);

        schemaStoreMock
            .setup(x => x.apiKeys)
            .returns(() => this.apiKeysStore.object);

        const authClientMock = TypeMoq.Mock.ofType<Xero.IAuth>();

        this.mocks.push(authClientMock);

        const connectionsManager = new XeroConnection.Manager(
            schemaStoreMock.object,
            authClientMock.object,
            this.payhawkAccountId,
            loggerMock.object,
        );

        const controller = new IntegrationsController(
            () => connectionsManager,
            () => integrationsManager,
            loggerMock.object,
        );

        return controller;
    }
}

function getContactsResponse() {
    return {
        response: {},
        body: {
            contacts: [
                {
                    contactID: '103e5c4d-e562-4d60-a412-ce0fbee6491d',
                    contactStatus: 'ACTIVE',
                    name: 'Aircall SAS',
                    emailAddress: '',
                    contactPersons: [],
                    bankAccountDetails: '',
                    taxNumber: 'FR85807437595',
                    addresses: [
                        {
                            addressType: 'STREET',
                            city: '',
                            region: '',
                            postalCode: '',
                            country: '',
                        },
                        {
                            addressType: 'POBOX',
                            city: '',
                            region: '',
                            postalCode: '',
                            country: '',
                        },
                    ],
                    phones: [
                        {
                            phoneType: 'DDI',
                            phoneNumber: '',
                            phoneAreaCode: '',
                            phoneCountryCode: '',
                        },
                        {
                            phoneType: 'DEFAULT',
                            phoneNumber: '',
                            phoneAreaCode: '',
                            phoneCountryCode: '',
                        },
                        {
                            phoneType: 'FAX',
                            phoneNumber: '',
                            phoneAreaCode: '',
                            phoneCountryCode: '',
                        },
                        {
                            phoneType: 'MOBILE',
                            phoneNumber: '',
                            phoneAreaCode: '',
                            phoneCountryCode: '',
                        },
                    ],
                    isSupplier: false,
                    isCustomer: false,
                    updatedDateUTC: '2021-07-12T10:30:30.613Z',
                    contactGroups: [],
                    hasAttachments: false,
                    hasValidationErrors: false,
                },
            ],
        },
    } as any;
}

function getOrganisationResponse() {
    return {
        Id: 'b0431b7c-4fdf-4013-8be2-ce8ff76712f1',
        Status: 'OK',
        ProviderName: 'Payhawk-local-OAuth2.0',
        DateTimeUTC: '/Date(1626086681758)/',
        Organisations: [
            {
                Name: 'Demo Company (Global)',
                LegalName: 'Demo Company (Global)',
                PaysTax: true,
                Version: 'GLOBAL',
                OrganisationType: 'COMPANY',
                BaseCurrency: 'USD',
                CountryCode: 'CA',
                IsDemoCompany: true,
                OrganisationStatus: 'ACTIVE',
                TaxNumber: '101-2-303',
                FinancialYearEndDay: 31,
                FinancialYearEndMonth: 12,
                SalesTaxBasis: 'ACCRUALS',
                SalesTaxPeriod: '3MONTHLY',
                DefaultSalesTax: 'Remember previous',
                DefaultPurchasesTax: 'Remember previous',
                PeriodLockDate: '/Date(1222732800000+0000)/',
                CreatedDateUTC: '/Date(1626085587613)/',
                OrganisationEntityType: 'COMPANY',
                Timezone: 'EASTERNSTANDARDTIME',
                ShortCode: '!G7!f2',
                OrganisationID: '90cf78c0-7cfc-4e57-9234-e1da98b4efcd',
                Edition: 'BUSINESS',
                Class: 'DEMO',
                Addresses: [
                    {
                        AddressType: 'POBOX',
                        AddressLine1: '23 Main Street',
                        AddressLine2: 'Central City',
                        City: 'Marineville',
                        Region: '',
                        PostalCode: '12345',
                        Country: '',
                        AttentionTo: '',
                    },
                ],
                Phones: [
                    {
                        PhoneType: 'OFFICE',
                        PhoneNumber: '1234 5678',
                        PhoneAreaCode: '800',
                    },
                ],
                ExternalLinks: [],
                PaymentTerms: {},
                TaxNumberName: 'Tax reg',
            },
        ],
    };
}
