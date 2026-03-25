import React from 'react';
import type { DeepReadonly, IChannelScales, IRow, IViewField, VegaGlobalConfig } from '../../interfaces';
export interface IPOIRendererProps {
    name?: string;
    data: IRow[];
    allFields: DeepReadonly<IViewField[]>;
    defaultAggregated: boolean;
    latitude: DeepReadonly<IViewField> | undefined;
    longitude: DeepReadonly<IViewField> | undefined;
    color: DeepReadonly<IViewField> | undefined;
    opacity: DeepReadonly<IViewField> | undefined;
    size: DeepReadonly<IViewField> | undefined;
    details: readonly DeepReadonly<IViewField>[];
    vegaConfig: VegaGlobalConfig;
    scales: IChannelScales;
    tileUrl?: string;
}
export interface IPOIRendererRef {
}
export declare const isValidLatLng: (latRaw: unknown, lngRaw: unknown) => boolean;
declare const POIRenderer: React.ForwardRefExoticComponent<IPOIRendererProps & React.RefAttributes<IPOIRendererRef>>;
export default POIRenderer;
