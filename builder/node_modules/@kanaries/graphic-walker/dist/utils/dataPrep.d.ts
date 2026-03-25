import { IMutField, IRow } from "../interfaces";
export declare function guardDataKeys(data: IRow[], metas: IMutField[]): {
    safeData: IRow[];
    safeMetas: IMutField[];
};
export declare function flatKeys(obj: Object, prefixKeys?: string[]): string[][];
export declare function getValueByKeyPath(object: any, keyPath: string[]): any;
