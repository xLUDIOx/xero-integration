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
