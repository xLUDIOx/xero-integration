export interface IManager {
    getAuthorizationUrl(): Promise<string>;
    authenticate(verifier: string): Promise<void>;
    getChartOfAccounts(): Promise<any[]>;
}
