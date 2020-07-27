export interface IMigratedAuthTokenSet {
    access_token: string;
    refresh_token: string;
    expires_in: string;
    token_type: 'Bearer';
    xero_tenant_id: string;
}
