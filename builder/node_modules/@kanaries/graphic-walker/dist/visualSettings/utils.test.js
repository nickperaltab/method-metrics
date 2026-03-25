import { omitRedundantSeparator } from './utils';
describe('omitRedundantSeparator', () => {
    const testItem = { key: 'test' };
    test('heading consecutive separator', () => {
        const items = ['-', '-', testItem];
        expect(omitRedundantSeparator(items)).toEqual([testItem]);
    });
    test('trailing consecutive separator', () => {
        const items = [testItem, '-', '-'];
        expect(omitRedundantSeparator(items)).toEqual([testItem]);
    });
    test('middle consecutive separators', () => {
        const items = [testItem, '-', '-', testItem, '-', testItem];
        expect(omitRedundantSeparator(items)).toEqual([testItem, '-', testItem, '-', testItem]);
    });
});
//# sourceMappingURL=utils.test.js.map