import { IRow, IViewField } from '../../interfaces';
import { IFoldQuery } from '../../interfaces';
export declare function fold(data: IRow[], query: IFoldQuery): IRow[];
export declare function replaceAggForFold<T extends {
    aggName?: string;
}>(x: T, newAggName?: string): T;
export declare function fold2(data: IRow, defaultAggregated: boolean, allFields: IViewField[], viewMeasures: IViewField[], viewDimensions: IViewField[], folds?: string[]): any;
