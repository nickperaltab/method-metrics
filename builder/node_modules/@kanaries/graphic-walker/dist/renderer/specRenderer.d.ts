import React from 'react';
import { IReactVegaHandler } from '../vis/react-vega';
import { DraggableFieldState, IRow, IThemeKey, IVisualConfigNew, IVisualLayout, IChannelScales } from '../interfaces';
import { GWGlobalConfig } from '../vis/theme';
interface SpecRendererProps {
    name?: string;
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    data: IRow[];
    draggableFieldState: DraggableFieldState;
    visualConfig: IVisualConfigNew;
    layout: IVisualLayout;
    onGeomClick?: ((values: any, e: any) => void) | undefined;
    onChartResize?: ((width: number, height: number) => void) | undefined;
    locale?: string;
    scales?: IChannelScales;
    onReportSpec?: (spec: string) => void;
    disableCollapse?: boolean;
}
/**
 * Sans-store renderer of GraphicWalker.
 * This is a pure component, which means it will not depend on any global state.
 */
declare const SpecRenderer: React.ForwardRefExoticComponent<SpecRendererProps & React.RefAttributes<IReactVegaHandler>>;
export default SpecRenderer;
