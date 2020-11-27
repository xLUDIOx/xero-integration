import * as toCamelCaseKeys from 'camelcase-keys';

export const ObjectSerializer = Object.freeze({
    deserialize: <T>(data: any): T => {
        return toCamelCaseKeys(data);
    },
});
