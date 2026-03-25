import { filterByPredicates, getMeaAggKey } from '../../utils';
import { aggregate } from '../op/aggregate';
import { groupByAnalyticTypes } from './utils';
export function explainValue(props) {
    const { viewFields, dataSource, predicates } = props;
    const { dimensions: dimsInView, measures: measInView } = groupByAnalyticTypes(viewFields);
    const viewData = aggregate(dataSource, {
        groupBy: dimsInView.map((f) => f.fid),
        op: 'aggregate',
        measures: measInView.map((mea) => {
            const agg = (mea.aggName ?? 'sum');
            return {
                field: mea.fid,
                agg,
                asFieldKey: getMeaAggKey(mea.fid, agg),
            };
        }),
    });
    const selection = filterByPredicates(viewData, predicates);
    const cmps = [];
    for (let mea of measInView) {
        const values = viewData.map((r) => r[mea.fid]).sort((a, b) => a - b);
        const selectionValues = selection.map((r) => r[mea.fid]);
        const lowerBoundary = values[Math.floor(values.length * 0.15)];
        const higherBoundary = values[Math.min(Math.ceil(values.length * 0.85), values.length - 1)];
        if (selectionValues.some((v) => v >= higherBoundary)) {
            cmps.push(1);
        }
        else if (selectionValues.some((v) => v <= lowerBoundary)) {
            cmps.push(-1);
        }
        else {
            cmps.push(0);
        }
    }
    return cmps;
}
//# sourceMappingURL=explainValue.js.map