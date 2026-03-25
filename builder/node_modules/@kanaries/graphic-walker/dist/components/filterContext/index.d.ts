import { IAggregator, IChannelScales, IChart, IComputationFunction, IDarkMode, IDataQueryPayload, IRow, IThemeKey, IUIThemeConfig, IVisualLayout } from "../../interfaces";
import { GWGlobalConfig } from "../../vis/theme";
import React from 'react';
export declare function useNominalFilter(fid: string, initValue?: string[] | (() => string[])): {
    domain: string[];
    loading: boolean;
    value: string[];
    setValue: React.Dispatch<React.SetStateAction<string[]>>;
};
export declare const useTemporalFilter: (fid: string, initValue?: [number, number] | (() => [number, number]), offset?: number) => {
    domain: [number, number];
    loading: boolean;
    value: [number, number];
    setValue: React.Dispatch<React.SetStateAction<[number, number]>>;
};
export declare const useQuantitativeFilter: (fid: string, initValue?: [number, number] | (() => [number, number])) => {
    domain: [number, number];
    loading: boolean;
    value: [number, number];
    setValue: React.Dispatch<React.SetStateAction<[number, number]>>;
};
export declare function Chart({ chart, ...props }: {
    chart: IChart;
    className?: string;
    name?: string;
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    appearance?: IDarkMode;
    uiTheme?: IUIThemeConfig;
    locale?: string;
    scales?: IChannelScales;
    overrideSize?: IVisualLayout['size'];
}): React.JSX.Element;
declare function ComputationProvider(props: {
    data: any[];
    children?: React.ReactNode | Iterable<React.ReactNode>;
}): any;
declare function ComputationProvider(props: {
    computation: IComputationFunction;
    children?: React.ReactNode | Iterable<React.ReactNode>;
}): any;
export { ComputationProvider };
export declare function SelectFilter(props: {
    fid: string;
    name: string;
    defaultValue?: string[];
    uiTheme?: IUIThemeConfig;
}): React.JSX.Element;
export declare function RangeFilter(props: {
    fid: string;
    name: string;
    defaultValue?: [number, number];
    uiTheme?: IUIThemeConfig;
}): React.JSX.Element;
export declare function TemporalFilter(props: {
    fid: string;
    name: string;
    defaultValue?: [number, number];
    uiTheme?: IUIThemeConfig;
}): React.JSX.Element;
export declare function useComputedValue(payload: IDataQueryPayload): IRow[] | null;
export declare function useAggergateValue(fid: string, aggName: IAggregator): number | undefined;
