export * from './ExportError';
export * from './ForbiddenError';
export * from './TenantConflictError';

export const TAX_TYPE_IS_MANDATORY_MESSAGE = 'The TaxType field is mandatory';
export const DOCUMENT_DATE_IN_LOCKED_PERIOD_MESSAGE = 'The document cannot be edited as it is currently dated before the end of year lock date';
export const INVALID_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' is not a valid code|Account must be valid/;
export const ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' has been archived/;
export const ARCHIVED_BANK_ACCOUNT_MESSAGE_REGEX = /.+ bank account is archived and cannot be used/;
export const LOCKED_PERIOD_ERROR_MESSAGE = 'Cannot export expense into Xero because the service period is locked for this organisation';
export const EXPENSE_RECONCILED_ERROR_MESSAGE = 'Cannot export expense into Xero because it has been reconciled';
export const DEFAULT_GENERAL_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE = 'Default general expense account is required but it is currently of status \'ARCHIVED\'';
export const DEFAULT_FEES_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE = 'Default fees expense account is required but it is currently of status \'ARCHIVED\'';
export const TRACKING_CATEGORIES_MISMATCH_ERROR_MESSAGE = 'Tracking categories mismatch after update';
