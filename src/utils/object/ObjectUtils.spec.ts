import { ObjectSerializer } from './ObjectSerializer';

describe('Object utils', () => {
    const serialized = {
        Test: 1,
        Inner: {
            NewTest: new Date(2021, 1, 1),
            OtherTest: 'test',
        },
    };

    const deserialized = {
        test: 1,
        inner: {
            newTest: new Date(2021, 1, 1),
            otherTest: 'test',
        },
    };

    it('should convert to camel case', () => {
        const result = ObjectSerializer.deserialize(serialized);
        expect(result).toEqual(deserialized);
    });

    it('should convert to pascal case', () => {
        const result = ObjectSerializer.serialize(deserialized);
        expect(result).toEqual(serialized);
    });
});
