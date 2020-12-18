export * from './OperationNotAllowedError';
export * from './ForbiddenError';

export const INVALID_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' is not a valid code|Account must be valid/g;
export const ARCHIVED_ACCOUNT_CODE_MESSAGE_REGEX = /Account code '.+' has been archived/g;
export const ARCHIVED_BANK_ACCOUNT_MESSAGE_REGEX = /.+ bank account is archived and cannot be used/g;
export const LOCK_PERIOD_ERROR_MESSAGE = 'Cannot export expense into Xero because the service period is locked for this organisation';
export const EXPENSE_RECONCILED_ERROR_MESSAGE = 'Cannot export expense into Xero because it has been reconciled';
export const DEFAULT_ACCOUNT_CODE_ARCHIVED_ERROR_MESSAGE = 'Default expense account is required, but it is currently of status \'ARCHIVED\'';
