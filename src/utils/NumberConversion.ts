export const MYRIAD = 10000;
export const B_MYRIAD = BigInt(MYRIAD);

export const numberToMyriadths = (n: number): string => (BigInt(Math.trunc(n)) * B_MYRIAD + BigInt(Math.round((n % 1) * MYRIAD))).toString();
export const myriadthsToNumber = (m: string): number => {
    const b = BigInt(m);
    return Number(b / B_MYRIAD) + Number(b % B_MYRIAD) / MYRIAD;
};
