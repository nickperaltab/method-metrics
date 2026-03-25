import { IMutField, IRow, ISemanticType, IUncertainMutField } from '../interfaces';
export declare function getTimeFormat(data: string | number): string;
/**
 * check if this array is a date time array based on some common date format
 * @param data string array
 * @returns
 */
export declare function isDateTimeArray(data: string[]): boolean;
export declare function isNumericArray(data: any[]): boolean;
export declare function inferSemanticType(data: IRow[], path: string[]): ISemanticType;
export declare function inferMeta(props: {
    dataSource: IRow[];
    fields: IUncertainMutField[];
}): IMutField[];
