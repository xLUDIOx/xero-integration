export const MYRIAD = 10000;
export const B_MYRIAD = BigInt(MYRIAD);

const RATE_FIXED_CONST = 5;
const RATE_FIXED_MULTIPLIER = 10 ** RATE_FIXED_CONST;
const B_RATE_FIXED_MULTIPLIER = BigInt(RATE_FIXED_MULTIPLIER);

export const numberToMyriadths = (n: number): string => (BigInt(Math.trunc(n)) * B_MYRIAD + BigInt(Math.round((n % 1) * MYRIAD))).toString();

export const sumAmounts = (...num: number[]): number => {
    const result = myriadthsToAmount(
        num.reduce((s, n) => s += BigInt(numberToMyriadths(n)), BigInt(0)).toString()
    );

    return result;
};

export const multiplyAmountByRate = (amount: number, rate: number): number => {
    const intAmount = BigInt(numberToMyriadths(amount));
    return myriadthsToAmount(multiplyRate(rate, intAmount).toString());
};

const multiplyRate = (rate: number, bigInt: bigint): bigint => {
    return (BigInt(Math.round(rate * RATE_FIXED_MULTIPLIER)) * bigInt) / B_RATE_FIXED_MULTIPLIER;
};

const myriadthsToNumber = (m: string): number => {
    const b = BigInt(m);
    return Number(b / B_MYRIAD) + Number(b % B_MYRIAD) / MYRIAD;
};

function myriadthsToAmount(m: string): number {
    return +myriadthsToNumber(m).toFixed(2);
}
