import type { IDataQueryWorkflowStep, IExpression, IViewField, IVisFilter, IDataQueryPayload, IFilterField, IChart, IMutField, IVisSpec } from '../interfaces';
import type { VizSpecStore } from '../store/visualSpecStore';
export declare const createFilter: (f: IFilterField) => IVisFilter;
export declare const toWorkflow: (viewFilters: VizSpecStore['viewFilters'], allFields: IViewField[], viewDimensionsRaw: IViewField[], viewMeasuresRaw: IViewField[], defaultAggregated: VizSpecStore['config']['defaultAggregated'], sort: 'none' | 'ascending' | 'descending', folds?: string[], limit?: number, timezoneDisplayOffset?: number) => IDataQueryWorkflowStep[];
export declare const addTransformForQuery: (query: IDataQueryPayload, transform: {
    key: string;
    expression: IExpression;
}[]) => IDataQueryPayload;
export declare const addFilterForQuery: (query: IDataQueryPayload, filters: IVisFilter[]) => IDataQueryPayload;
/**
 * @deprecated
 */
export declare const chartToWorkflow: typeof specToWorkflow;
export declare function specToWorkflow(chart: IVisSpec | IChart): IDataQueryPayload;
export declare const processExpression: (exp: IExpression, allFields: IMutField[], config: {
    timezoneDisplayOffset?: number;
}) => IExpression;
