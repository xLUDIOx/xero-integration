import * as assert from 'assert';

import * as TypeMoq from 'typemoq';

import { filterUndefinedFields } from '../object';

/**
 *  setup typemoq param to equal object. It will skip undefined fields =>  {} is same as {a:undefined}
 *
 * @export
 * @template T
 * @param {T} obj
 * @returns T
 */
export function typeIsEqualSkipUndefined<T>(obj: T) {
    return TypeMoq.It.is<T>(obj2 => {
        const filteredObj1 = filterUndefinedFields(obj);
        const filteredObj2 = filterUndefinedFields(obj2);
        try {
            assert.deepStrictEqual(filteredObj1, filteredObj2);
        } catch {
            return false;
        }

        return true;
    });
}

/**
 *  checks if actual is deep equal to expected.  It will skip undefined fields =>  {} is same as {a:undefined}
 *
 * @export
 * @template T
 * @param {T} actual
 * @param {T} expected
 */
export function expectToDeepEqualSkipUndefined<T>(actual: T, expected: T) {
    assert.deepStrictEqual(filterUndefinedFields(actual), filterUndefinedFields(expected));
    return true;
}
