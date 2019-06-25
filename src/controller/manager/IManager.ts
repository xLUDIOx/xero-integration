
export interface IManager {
    isXeroAuthenticated(): boolean;
    getXeroAuthorizationUrl(): Promise<string>;
    xeroAuthenticate(verifier: string): Promise<boolean>;
    synchronizeChartOfAccounts(payhawkApiKey: string): Promise<void>;
}
