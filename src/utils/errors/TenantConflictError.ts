export class TenantConflictError extends Error {
    constructor(readonly tenantId: string, readonly accountId: string, readonly conflictingAccountId: string) {
        super();

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
