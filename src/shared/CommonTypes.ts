export type ExcludeStrict<T extends string, K extends T> = Exclude<T, K>;
export type Intersection<P, Q> = Pick<P & Q, keyof P & keyof Q>;
export type KeyNameMap<T> = { [P in keyof T]: P };
export type OmitStrict<T, K extends keyof T> = Omit<T, K>;
export type Optional<T> = T | undefined;
export type RequiredNonNull<T> = { [P in keyof T]-?: NonNullable<T[P]> };
export type RequiredNonNullBy<T, K extends keyof T> = RequiredNonNull<Pick<T, K>> & OmitStrict<T, K>;
export type PartialBy<T, K extends keyof T> = OmitStrict<T, K> & Partial<Pick<T, K>>;
