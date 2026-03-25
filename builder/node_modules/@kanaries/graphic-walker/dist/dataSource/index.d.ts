import React from 'react';
import { IUIThemeConfig, IComputationFunction, IDarkMode, IDataSourceProvider, IMutField, IThemeKey } from '../interfaces';
import { CommonStore } from '../store/commonStore';
import { VizSpecStore } from '../store/visualSpecStore';
import { GWGlobalConfig } from '../vis/theme';
interface DSSegmentProps {
    commonStore: CommonStore;
    dataSources: {
        name: string;
        id: string;
    }[];
    selectedId: string;
    onSelectId: (value: string) => void;
    onSave?: () => Promise<Blob>;
    onLoad?: (file: File) => void;
}
declare const DataSourceSegment: React.FC<DSSegmentProps>;
export declare function DataSourceSegmentComponent(props: {
    provider: IDataSourceProvider;
    displayOffset?: number;
    /** @deprecated renamed to appearence */
    dark?: IDarkMode;
    appearance?: IDarkMode;
    /** @deprecated use vizThemeConfig instead */
    themeKey?: IThemeKey;
    /** @deprecated use vizThemeConfig instead */
    themeConfig?: GWGlobalConfig;
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    /** @deprecated renamed to uiTheme */
    colorConfig?: IUIThemeConfig;
    uiTheme?: IUIThemeConfig;
    children: (props: {
        meta: IMutField[];
        onMetaChange: (fid: string, meta: Partial<IMutField>) => void;
        computation: IComputationFunction;
        storeRef: React.RefObject<VizSpecStore>;
        datasetName: string;
        syncSpecs: () => void;
    }) => JSX.Element;
}): React.JSX.Element;
export default DataSourceSegment;
