export interface IEnvironment {
    xeroAuthUrl: string;
    xeroLoginUrl: string;
    xeroApiUrl: string;
    fxRatesApiUrl: string;
    fxRatesApiKey: string;
}

class Environment implements IEnvironment {
    get fxRatesApiUrl(): string {
        return this.getRequiredEnvVariable('FX_RATES_API_URL');
    }

    get fxRatesApiKey(): string {
        return this.getRequiredEnvVariable('FX_RATES_API_KEY');
    }

    get xeroApiUrl() {
        return this.getRequiredEnvVariable('XERO_API_URL');
    }

    get xeroAuthUrl() {
        return this.getRequiredEnvVariable('XERO_AUTH_URL');
    }

    get xeroLoginUrl() {
        return this.getRequiredEnvVariable('XERO_LOGIN_URL');
    }

    private getRequiredEnvVariable(varName: string): string {
        const value = process.env[varName];
        if (!value) {
            throw Error(`Missing required env variable ${varName}`);
        }

        return value;
    }
}

let env: IEnvironment;

export const getEnv = () => {
    if (!env) {
        env = new Environment();
    }

    return env;
};
