import { IDataSource, IMutField, IRow, IStoInfo, IStoInfoV2 } from '../interfaces';
export declare class DataStore {
    metaDict: Record<string, IMutField[]>;
    metaMap: Record<string, string>;
    visDict: Record<string, string[]>;
    dataSources: Required<IDataSource>[];
    updateDatasetMetas(id: string, fid: string, diffMeta: Partial<IMutField>): void;
    importData(data: IStoInfo): void;
    exportData(): IStoInfoV2;
    addDataSource(data: {
        data: IRow[];
        fields: IMutField[];
        name: string;
    }): string;
}
