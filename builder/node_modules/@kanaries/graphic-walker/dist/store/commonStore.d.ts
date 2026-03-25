import { IDataSetInfo, IDataSourceProvider, IMutField, IRow } from '../interfaces';
export declare class CommonStore {
    tmpDSName: string;
    tmpDSRawFields: IMutField[];
    tmpDataSource: IRow[];
    showDSPanel: boolean;
    provider: IDataSourceProvider;
    private onCommitDS;
    displayOffset: number | undefined;
    constructor(provider: IDataSourceProvider, onCommitDS: (datasetId: string) => void, config: {
        displayOffset?: number;
    });
    setShowDSPanel(show: boolean): void;
    initTempDS(): void;
    updateTempFields(fields: IMutField[]): void;
    updateTempDatasetMetas(fid: string, diffMeta: Partial<IMutField>): void;
    updateTempFieldAnalyticType(fieldKey: string, analyticType: IMutField['analyticType']): void;
    updateTempFieldSemanticType(fieldKey: string, semanticType: IMutField['semanticType']): void;
    updateTempName(name: string): void;
    updateTempDS(rawData: IRow[]): void;
    /**
     * update temp dataset (standard) with dataset info
     * @param dataset
     */
    updateTempSTDDS(dataset: IDataSetInfo): void;
    commitTempDS(): void;
    startDSBuildingTask(): void;
    setDisplayOffset(displayOffset?: number): void;
}
