import React from 'react';
import { IViewField, IRow, IStackMode, VegaGlobalConfig, IChannelScales, IConfigScaleSet, IDarkMode } from '../interfaces';
interface IReactPlotHandler {
    getSVGData: () => Promise<string[]>;
    getCanvasData: () => Promise<string[]>;
    downloadSVG: (filename?: string) => Promise<string[]>;
    downloadPNG: (filename?: string) => Promise<string[]>;
}
export interface ObservablePlotProps {
    name?: string;
    rows: Readonly<IViewField[]>;
    columns: Readonly<IViewField[]>;
    dataSource: readonly IRow[];
    defaultAggregate?: boolean;
    stack: IStackMode;
    interactiveScale: boolean;
    geomType: string;
    color?: IViewField;
    opacity?: IViewField;
    size?: IViewField;
    shape?: IViewField;
    theta?: IViewField;
    radius?: IViewField;
    text?: IViewField;
    details?: Readonly<IViewField[]>;
    showActions: boolean;
    layoutMode: string;
    width: number;
    height: number;
    onGeomClick?: (values: any, e: any) => void;
    vegaConfig: VegaGlobalConfig;
    /** @default "en-US" */
    locale?: string;
    useSvg?: boolean;
    dark?: IDarkMode;
    scales?: IChannelScales;
    scale?: IConfigScaleSet;
    onReportSpec?: (spec: string) => void;
    displayOffset?: number;
}
/**
 * This component attempts to replicate the same multi-chart layout
 * from rowRepeatFields * colRepeatFields. It does not implement
 * cross-filtering by default. If you want that, you’ll need to
 * manually add pointer/brush listeners, manage the state store, etc.
 */
declare const ObservablePlotRenderer: React.ForwardRefExoticComponent<ObservablePlotProps & React.RefAttributes<IReactPlotHandler>>;
export default ObservablePlotRenderer;
