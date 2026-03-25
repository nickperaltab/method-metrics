import React from 'react';
import { IThemeKey, IComputationFunction, IChannelScales, IVisualLayout } from '../interfaces';
import { IReactVegaHandler } from '../vis/react-vega';
import { GWGlobalConfig } from '../vis/theme';
interface RendererProps {
    vizThemeConfig: IThemeKey | GWGlobalConfig;
    computationFunction: IComputationFunction;
    scales?: IChannelScales;
    csvRef?: React.MutableRefObject<{
        download: () => void;
    }>;
    overrideSize?: IVisualLayout['size'];
}
declare const _default: React.MemoExoticComponent<React.ForwardRefExoticComponent<Omit<RendererProps & React.RefAttributes<IReactVegaHandler>, "ref"> & React.RefAttributes<IReactVegaHandler>>>;
export default _default;
