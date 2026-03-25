import type { IChannelScales, IRow, IViewField, VegaGlobalConfig } from '../../interfaces';
export interface Scale<T> {
    (record: IRow): T;
}
export type ColorDisplay = {
    type: 'nominal';
    colors: {
        name: string;
        color: string;
    }[];
} | {
    type: 'quantitative' | 'temporal';
    color: string[];
    domain: [number, number];
};
export declare const useColorScale: (data: IRow[], field: IViewField | null | undefined, defaultAggregate: boolean, vegaConfig: VegaGlobalConfig) => {
    mapper: Scale<string>;
    display?: ColorDisplay;
};
export declare const useSizeScale: (data: IRow[], field: IViewField | null | undefined, defaultAggregate: boolean, scaleConfig: IChannelScales) => Scale<number>;
export declare const useOpacityScale: (data: IRow[], field: IViewField | null | undefined, defaultAggregate: boolean, scaleConfig: IChannelScales) => Scale<number>;
