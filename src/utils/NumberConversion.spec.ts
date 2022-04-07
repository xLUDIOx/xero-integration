import { multiplyAmountByRate } from './NumberConversion';

describe('Number Conversion', () => {
    describe(multiplyAmountByRate.name, () => {
        it('should multiply by 0', () => {
            const result = multiplyAmountByRate(2, 0);
            expect(result).toEqual(0);
        });

        it('should multiply integers', () => {
            const result = multiplyAmountByRate(123123123, 3);
            expect(result).toEqual(369369369);
        });

        it('should multiply numbers and return two digits after the decimal point', () => {
            const result = multiplyAmountByRate(1.05, 3.209); // 3.36945
            expect(result).toEqual(3.37);
        });
    });
});
