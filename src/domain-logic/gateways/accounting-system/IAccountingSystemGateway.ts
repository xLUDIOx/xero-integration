import { Optional } from '@shared';
import { ILogger } from '@utils';

import {
    ChartOfAccounts,
    Currency,
    CustomClass,
    Department,
    Employee,
    FinancialAccountType,
    IDeposit,
    ISubsidiary,
    TaxRate,
    Vendor,
} from '../../entities';
import { PayableEntityType } from '../../use-cases';

export interface IAccountingSystemGateway {
    name: string;

    pullSubsidiaries(): Promise<ISubsidiary[]>;

    pullCurrencies(subsidiaryId: string): Promise<Currency[]>;
    pullChartOfAccounts(subsidiaryId: string): Promise<ChartOfAccounts>;

    getOrCreateCurrency(subsidiaryId: string, newCurrency: INewCurrency): Promise<string>;
    getOrCreateAccount(subsidiaryId: string, newAccount: INewFinancialAccount): Promise<string>;

    pullBankAccounts(subsidiaryId: string): Promise<ChartOfAccounts>;
    pullAccountsPayableAccounts(subsidiaryId: string): Promise<ChartOfAccounts>;
    pullTaxRates(subsidiaryId: string): Promise<TaxRate[]>;
    pullDepartments(subsidiaryId: string): Promise<Department[]>;
    pullCustomClasses(subsidiaryId: string): Promise<CustomClass[]>;

    pullVendors(subsidiaryId: string): Promise<Vendor[]>;
    getOrCreateVendor(subsidiaryId: string, newVendor: INewVendor): Promise<string>;

    getEmployee(subsidiaryId: string, employeeData: IEmployee): Promise<Optional<Employee>>;

    createVendorBill(subsidiaryId: string, newVendorBill: INewVendorBill): Promise<IVendorBillResult>;
    updateVendorBill(subsidiaryId: string, vendorBillId: string, newVendorBill: INewVendorBill): Promise<void>;
    deleteVendorBill(subsidiaryId: string, vendorBillId: string): Promise<void>;

    createVendorCredit(subsidiaryId: string, newVendorCredit: INewVendorCredit): Promise<IVendorCreditResult>;
    updateVendorCredit(subsidiaryId: string, vendorCreditId: string, newVendorCredit: INewVendorCredit): Promise<void>;
    deleteVendorCredit(subsidiaryId: string, vendorCreditId: string): Promise<void>;

    createPayment(subsidiaryId: string, newPayment: INewPayment): Promise<IPaymentResult>;
    deletePayment(subsidiaryId: string, paymentId: string): Promise<void>;

    attachFile(newAttachment: INewAttachment): Promise<IAttachmentResult>;
    detachFile(fileId: string, removedAttachment: IRemovedAttachment): Promise<void>;

    createDeposit(subsidiaryId: string, newDeposit: IDeposit): Promise<Required<IDeposit>>;
}

export interface INewPayment {
    payeeId: string;
    entityId: string;
    entityType: PayableEntityType;
    entityCurrencyId: string;
    originalAmount: number;
    paymentFxRate?: number;
    paymentBankAccountId: string;
    paymentKey: string;
    paymentDate: Date;
    paymentNumber: string;
}

export interface IPaymentResult {
    paymentId: string;
    paymentUrl: string;
}

export interface IEmployee {
    name: string;
    email?: string;
    id?: string;
}

export interface IVendorBillResult {
    vendorBillId: string;
    vendorBillUrl: string;
}

export interface IVendorCreditResult {
    vendorCreditId: string;
    vendorCreditUrl: string;
}

export interface INewFinancialAccount {
    name: string;
    code: string;
    type: FinancialAccountType;
    currency?: string;
    description?: string;
}

export interface INewCurrency {
    code: string;
}

export interface INewVendor {
    name: string;
    vat?: string;
}

export interface INewVendorBill extends IHasLinesItems {
    currencyId: string;
    vendorId: string;
    referenceNumber: string;

    accountsPayableAccountId?: string;
    memo?: string;
    documentDate?: Date;
    documentNumber?: string;
}

export interface INewVendorCredit extends IHasLinesItems {
    currencyId: string;
    vendorId: string;
    referenceNumber: string;

    accountsPayableAccountId?: string;
    memo?: string;
    documentDate?: Date;
    documentNumber?: string;
}

export interface INewAttachment {
    fileName: string;
    fileType: string;
    fileContents: Buffer;
    entityType: PayableEntityType;
    entityId: string;
}

export interface IRemovedAttachment {
    entityType: PayableEntityType;
    entityId: string;
}

export interface IAttachmentResult {
    fileId: string;
}

export type IAccountingSystemGatewayFactory = (accountingSystemAccountId: string, accessTokenData: any, logger: ILogger) => IAccountingSystemGateway;
