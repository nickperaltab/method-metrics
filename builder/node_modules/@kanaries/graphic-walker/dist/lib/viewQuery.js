import { aggregate } from './op/aggregate';
import { fold } from './op/fold';
import { bin } from './op/bin';
export function queryView(rawData, query) {
    switch (query.op) {
        case 'aggregate':
            return aggregate(rawData, query);
        case 'fold':
            return fold(rawData, query);
        case 'bin':
            return bin(rawData, query);
        case 'raw':
        default:
            return rawData;
    }
}
//# sourceMappingURL=viewQuery.js.map