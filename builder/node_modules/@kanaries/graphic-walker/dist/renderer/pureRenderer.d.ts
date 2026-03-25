import React from 'react';
import type { IDarkMode, IRow, IThemeKey, DraggableFieldState, IVisualConfig, IVisualConfigNew, IComputationFunction, IVisualLayout, IChannelScales, IUIThemeConfig } from '../interfaces';
import type { IReactVegaHandler } from '../vis/react-vega';
import { GWGlobalConfig } from '../vis/theme';
type IPureRendererProps = {
    className?: string;
    name?: string;
    /** @deprecated use vizThemeConfig instead */
    themeKey?: IThemeKey;
    /** @deprecated use vizThemeConfig instead */
    themeConfig?: GWGlobalConfig;
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    /** @deprecated renamed to appearance */
    dark?: IDarkMode;
    appearance?: IDarkMode;
    visualState: DraggableFieldState;
    visualConfig: IVisualConfigNew | IVisualConfig;
    visualLayout?: IVisualLayout;
    /** @deprecated renamed to uiTheme */
    colorConfig?: IUIThemeConfig;
    uiTheme?: IUIThemeConfig;
    locale?: string;
    /** @deprecated renamed to scales */
    channelScales?: IChannelScales;
    scales?: IChannelScales;
    overrideSize?: IVisualLayout['size'];
    disableCollapse?: boolean;
};
type LocalProps = {
    type?: 'local';
    rawData: IRow[];
};
type RemoteProps = {
    type: 'remote';
    computation: IComputationFunction;
};
export type IRemotePureRendererProps = IPureRendererProps & RemoteProps & React.RefAttributes<IReactVegaHandler>;
export type ILocalPureRendererProps = IPureRendererProps & LocalProps & React.RefAttributes<IReactVegaHandler>;
declare const _default: {
    (p: ILocalPureRendererProps): JSX.Element;
    (p: IRemotePureRendererProps): JSX.Element;
};
export default _default;
