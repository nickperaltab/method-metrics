import { IRow } from "../interfaces";
export declare function normalizeWithParent(data: IRow[], parentData: IRow[], measures: string[], syncScale: boolean): {
    normalizedData: IRow[];
    normalizedParentData: IRow[];
};
export declare function compareDistribution(distribution1: IRow[], distribution2: IRow[], dimensions: string[], measures: string[]): number;
export declare function compareDistributionKL(distribution1: IRow[], distribution2: IRow[], dimensions: string[], measures: string[]): number;
export declare function compareDistributionJS(distribution1: IRow[], distribution2: IRow[], dimensions: string[], measure: string): number;
export declare function normalizeByMeasures(dataSource: IRow[], measures: string[]): IRow[];
export declare function getDistributionDifference(dataSource: IRow[], dimensions: string[], measure1: string, measure2: string): number;
export declare function makeBinField(dataSource: IRow[], fid: string, binFid: string, binSize?: number | undefined): {
    [x: string]: any;
}[];
export declare function makeLogField(dataSource: IRow[], fid: string, logFid: string): {
    [x: string]: any;
}[];
