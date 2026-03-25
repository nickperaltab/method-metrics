import React from 'react';
import type { DeepReadonly, IChannelScales, IGeoUrl, IRow, IViewField, VegaGlobalConfig } from '../../interfaces';
import type { FeatureCollection } from 'geojson';
export interface IChoroplethRendererProps {
    name?: string;
    data: IRow[];
    allFields: DeepReadonly<IViewField[]>;
    features: FeatureCollection | undefined;
    featuresUrl?: IGeoUrl;
    geoKey: string;
    defaultAggregated: boolean;
    geoId: DeepReadonly<IViewField>;
    color: DeepReadonly<IViewField> | undefined;
    opacity: DeepReadonly<IViewField> | undefined;
    text: DeepReadonly<IViewField> | undefined;
    details: readonly DeepReadonly<IViewField>[];
    vegaConfig: VegaGlobalConfig;
    scaleIncludeUnmatchedChoropleth: boolean;
    showAllGeoshapeInChoropleth: boolean;
    scales: IChannelScales;
    tileUrl?: string;
}
export interface IChoroplethRendererRef {
}
declare const ChoroplethRenderer: React.ForwardRefExoticComponent<IChoroplethRendererProps & React.RefAttributes<IChoroplethRendererRef>>;
export default ChoroplethRenderer;
