import { getMeaAggKey } from '../../utils';
import { sum, mean, median, stdev, variance, max, min, count, distinctCount } from './stat';
import { expr } from '../sql';
import { newOffsetDate } from './offset';
const aggregatorMap = {
    sum,
    mean,
    median,
    stdev,
    variance,
    max,
    min,
    count,
    distinctCount,
};
const KEY_JOINER = '___';
export function aggregate(data, query) {
    const { groupBy, measures } = query;
    const ans = new Map();
    const groups = new Map();
    for (let row of data) {
        const gk = groupBy.map((k) => row[k]).join(KEY_JOINER);
        if (!groups.has(gk)) {
            groups.set(gk, []);
        }
        groups.get(gk)?.push(row);
    }
    for (let [gk, subGroup] of groups) {
        if (subGroup.length === 0) {
            continue;
        }
        let aggRow = {};
        for (let k of groupBy) {
            aggRow[k] = subGroup[0][k];
        }
        for (let mea of measures) {
            const aggMeaKey = mea.asFieldKey || getMeaAggKey(mea.field, mea.agg);
            if (aggRow[aggMeaKey] === undefined) {
                aggRow[aggMeaKey] = 0;
            }
            if (mea.agg === 'expr') {
                const result = expr(mea.field, subGroup);
                if (result instanceof Array) {
                    throw new Error(`except aggergated result, but got array; calc ${mea.field}`);
                }
                aggRow[aggMeaKey] = result;
            }
            else {
                const newDate = newOffsetDate(mea.offset);
                const values = subGroup
                    .map((r) => r[mea.field])
                    .map((x) => {
                    if (mea.format !== undefined) {
                        return newDate(x).getTime();
                    }
                    return x;
                });
                const aggregator = aggregatorMap[mea.agg] ?? sum;
                aggRow[aggMeaKey] = aggregator(values);
            }
        }
        ans.set(gk, aggRow);
    }
    return Array.from(ans.values());
}
//# sourceMappingURL=aggregate.js.map