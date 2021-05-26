export * from './ExportError';
export * from './ForbiddenError';
export * from './TenantConflictError';

export const INVALID_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' is not a valid code|Account must be valid/;
export const ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' has been archived/;
export const ARCHIVED_BANK_ACCOUNT_MESSAGE_REGEX = /.+ bank account is archived and cannot be used/;
export const LOCK_PERIOD_ERROR_MESSAGE = 'Cannot export expense into Xero because the service period is locked for this organisation';
export const EXPENSE_RECONCILED_ERROR_MESSAGE = 'Cannot export expense into Xero because it has been reconciled';
export const DEFAULT_GENERAL_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE = 'Default general expense account is required but it is currently of status \'ARCHIVED\'';
export const DEFAULT_FEES_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE = 'Default fees expense account is required but it is currently of status \'ARCHIVED\'';
export const TRACKING_CATEGORIES_MISMATCH_ERROR_MESSAGE = 'Tracking categories mismatch after update';
