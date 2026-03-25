import { filterByPredicates, getMeaAggKey } from '../../utils';
import { compareDistributionJS, normalizeWithParent } from '../../utils/normalization';
import { complementaryFields } from './utils';
import { toWorkflow } from '../../utils/workflow';
import { dataQuery } from '../../computation/index';
const QUANT_BIN_NUM = 10;
export async function explainBySelection(props) {
    const { allFields, viewFilters, viewMeasures, viewDimensions, predicates, computationFunction, timezoneDisplayOffset } = props;
    const complementaryDimensions = complementaryFields({
        all: allFields.filter((f) => f.analyticType === 'dimension'),
        selection: viewDimensions,
    });
    const outlierList = [];
    for (let extendDim of complementaryDimensions) {
        let extendDimFid = extendDim.fid;
        let extraPreWorkflow = [];
        if (extendDim.semanticType === 'quantitative') {
            extraPreWorkflow.push({
                type: 'transform',
                transform: [
                    {
                        key: extendDimFid,
                        expression: {
                            op: 'bin',
                            as: extendDimFid,
                            num: QUANT_BIN_NUM,
                            params: [{
                                    type: 'field',
                                    value: extendDim.fid,
                                }]
                        }
                    }
                ],
            });
        }
        for (let mea of viewMeasures) {
            const overallWorkflow = toWorkflow(viewFilters, allFields, [extendDim], [mea], true, 'none', [], undefined, timezoneDisplayOffset);
            const fullOverallWorkflow = extraPreWorkflow ? [...extraPreWorkflow, ...overallWorkflow] : overallWorkflow;
            const overallData = await dataQuery(computationFunction, fullOverallWorkflow);
            const viewWorkflow = toWorkflow(viewFilters, allFields, [...viewDimensions, extendDim], [mea], true, 'none', [], undefined, timezoneDisplayOffset);
            const fullViewWorkflow = extraPreWorkflow ? [...extraPreWorkflow, ...viewWorkflow] : viewWorkflow;
            const viewData = await dataQuery(computationFunction, fullViewWorkflow);
            const subData = filterByPredicates(viewData, predicates);
            let outlierNormalization = normalizeWithParent(subData, overallData, [getMeaAggKey(mea.fid, mea.aggName ?? 'sum')], false);
            let outlierScore = compareDistributionJS(outlierNormalization.normalizedData, outlierNormalization.normalizedParentData, [extendDim.fid], getMeaAggKey(mea.fid, mea.aggName ?? 'sum'));
            outlierList.push({
                measureField: mea,
                targetField: extendDim,
                score: outlierScore,
                normalizedData: subData,
                normalizedParentData: overallData,
            });
        }
    }
    return outlierList.sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=explainBySelection.js.map