export interface IEnvironment {
    fxRatesApiUrl: string;
    fxRatesApiKey: string;
}

class Environment implements IEnvironment {
    get fxRatesApiUrl(): string {
        const value = process.env.FX_RATES_API_URL;
        if (!value) {
            throw Error('Missing env variable FX_RATES_API_URL');
        }

        return value;
    }

    get fxRatesApiKey(): string {
        const value = process.env.FX_RATES_API_KEY;
        if (!value) {
            throw Error('Missing env variable FX_RATES_API_KEY');
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
