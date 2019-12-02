export type KeyNameMap<T> = { [P in keyof T]: P };
export type Intersection<P, Q> = Pick<P & Q, keyof P & keyof Q>;
