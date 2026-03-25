import { IFieldTransform, IRow } from '../interfaces';
export declare function transformData(data: IRow[], trans: IFieldTransform[]): Promise<IRow[]>;
