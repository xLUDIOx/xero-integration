import * as toCamelCaseKeys from 'camelcase-keys';
import { pascalCase as toPascalCase } from 'pascal-case';

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
    serialize: <T>(data: any): T => {
        const res: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'object' && !(value instanceof Date) && value !== null) {
                res[toPascalCase(key)] = ObjectSerializer.serialize(value);
            } else {
                res[toPascalCase(key)] = data[key];
            }
        }

        return res;
    },
});
