import type { IComputationFunction, IDataQueryPayload, IDataQueryWorkflowStep, IDatasetStats, IField, IFieldStats, IKeyWord, IMutField, IRow, IVisFilter } from '../interfaces';
import { range } from 'lodash-es';
export declare const datasetStats: (service: IComputationFunction) => Promise<IDatasetStats>;
export declare const dataReadRaw: (service: IComputationFunction, pageSize: number, pageOffset?: number, option?: {
    sorting?: {
        fid: string;
        sort: 'ascending' | 'descending';
    };
    filters?: IVisFilter[];
}) => Promise<IRow[]>;
export declare const dataQuery: (service: IComputationFunction, workflow: IDataQueryWorkflowStep[], limit?: number) => Promise<IRow[]>;
export declare const fieldStat: (service: IComputationFunction, field: IField, options: {
    values?: boolean;
    range?: boolean;
    valuesMeta?: boolean;
    selectedCount?: any[];
    valuesLimit?: number;
    valuesOffset?: number;
    sortBy?: 'value' | 'value_dsc' | 'count' | 'count_dsc' | 'none';
    timezoneDisplayOffset?: number;
    keyword?: IKeyWord;
}, allFields: IMutField[]) => Promise<IFieldStats>;
export declare function getRange(service: IComputationFunction, field: string): Promise<[number, number]>;
export declare function withComputedField(field: IField, allFields: IMutField[], service: IComputationFunction, config: {
    timezoneDisplayOffset?: number;
}): <T>(builder: (service: IComputationFunction) => Promise<T>) => Promise<T>;
export declare function getSample(service: IComputationFunction, field: string): Promise<any>;
export declare function getTemporalRange(service: IComputationFunction, field: string, offset?: number): Promise<[number, number, string]>;
export declare function getFieldDistinctMeta(service: IComputationFunction, field: string): Promise<{
    total: number;
    distinctTotal: number;
}>;
export declare function getFieldDistinctCounts(service: IComputationFunction, field: string, options?: {
    sortBy?: 'value' | 'count' | 'value_dsc' | 'count_dsc' | 'none';
    valuesLimit?: number;
    valuesOffset?: number;
}): Promise<{
    value: string;
    count: number;
}[]>;
export declare function profileNonmialField(service: IComputationFunction, field: string): Promise<[{
    total: number;
    distinctTotal: number;
}, {
    value: string;
    count: number;
}[]]>;
export declare function profileQuantitativeField(service: IComputationFunction, field: string): Promise<{
    min: any;
    max: any;
    binValues: {
        from: any;
        to: any;
        count: number;
    }[];
}>;
export declare function wrapComputationWithTag(service: IComputationFunction, tag: string): (payload: IDataQueryPayload) => Promise<IRow[]>;
