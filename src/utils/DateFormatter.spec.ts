import { fromDateTicks, isBeforeDate } from './DateFormatter';

describe('Date Formatter', () => {
    describe(fromDateTicks.name, () => {
        it('should convert ticks - 1607385600000+0000', () => {
            const input = '/Date(1607385600000+0000)/';
            const result = fromDateTicks(input);
            expect(result).toEqual(new Date(1607385600000));
        });

        it('should convert ticks - 1607385600000', () => {
            const input = '/Date(1607385600000)/';
            const result = fromDateTicks(input);
            expect(result).toEqual(new Date(1607385600000));
        });

        it('should return undefined - /Date(A)/', () => {
            const input = '/Date(A)/';
            const result = fromDateTicks(input);
            expect(result).toEqual(undefined);
        });

        it('should return undefined - test', () => {
            const input = 'test';
            const result = fromDateTicks(input);
            expect(result).toEqual(undefined);
        });
    });

    describe(isBeforeDate.name, () => {
        it('should return false - different dates', () => {
            const exportDate = new Date(Date.UTC(2020, 5, 10));
            const lockDate = new Date(Date.UTC(2020, 3, 5));

            const result = isBeforeDate(exportDate, lockDate);
            expect(result).toEqual(false);
        });

        it('should return false - same dates', () => {
            const exportDate = new Date(Date.UTC(2020, 5, 10));
            const lockDate = exportDate;

            const result = isBeforeDate(exportDate, lockDate);
            expect(result).toEqual(false);
        });

        it('should return true - different dates', () => {
            const exportDate = new Date(Date.UTC(2020, 5, 10));
            const lockDate = new Date(Date.UTC(2020, 6, 5));

            const result = isBeforeDate(exportDate, lockDate);
            expect(result).toEqual(true);
        });
    });
});
