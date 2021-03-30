import * as toCamelCaseKeys from 'camelcase-keys';

export const ObjectSerializer = Object.freeze({
    deserialize: <T>(data: any): T => {
        const res = toCamelCaseKeys(data);
        for (const [key, value] of Object.entries(res)) {
            if (typeof value === 'object' && value !== null) {
                res[key] = ObjectSerializer.deserialize(value);
            }
        }
        return res;
    },
});

/**
 * Removes undefined fields from value.
 *
 * @export
 * @template T
 * @param {T} value the object that will be cleaned up
 * - If the value does not have properties, it will be returned as is.
 * - If the value is array, it will remove the undefined elements and run the function recursively for each array element.
 * @param {boolean} [shallow=false] If shallow property is true, only first level undefined properties will be removed. For array this means that only undefined elements will be removed.
 * @return {*}  {T}
 */
export function filterUndefinedFields<T>(value: T, shallow: boolean = false): T {
    if (typeof value !== 'object') {
        return value;
    }

    if (value === null) {
        return value;
    }

    if (value instanceof Date) {
        return value;
    }

    if (Array.isArray(value)) {
        const result = value.filter(e => e !== undefined);
        if (shallow) {
            return result as unknown as T;
        }

        return result.map(e => filterUndefinedFields(e, shallow)) as unknown as T;
    }

    return strictObjectKeys(value)
        .filter(k => value[k] !== undefined) // Remove undefined
        .reduce((newObj, k) => ({
            ...newObj,
            [k]: shallow ? value[k] : filterUndefinedFields(value[k]), // Recursive
        }), {} as T);
}

/** Could return keys not of T if T is base Type */
export function strictObjectKeys<T>(obj: T): (keyof T)[] {
    const keys = Object.keys(obj);

    return keys as (keyof T)[];;
}
