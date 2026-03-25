import { IExpression, IRow } from '../interfaces';
export interface IDataFrame {
    [key: string]: any[];
}
export declare function execExpression(exp: IExpression, dataFrame: IDataFrame): Promise<IDataFrame>;
export declare function dataset2DataFrame(dataset: IRow[]): IDataFrame;
export declare function dataframe2Dataset(dataFrame: IDataFrame): IRow[];
