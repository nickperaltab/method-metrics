import React from 'react';
import { IDarkMode, IExperimentalFeatures } from '../interfaces';
import { IReactVegaHandler } from '../vis/react-vega';
import { ToolbarItemProps } from '../components/toolbar';
interface IVisualSettings {
    darkModePreference: IDarkMode;
    rendererHandler?: React.RefObject<IReactVegaHandler>;
    csvHandler?: React.MutableRefObject<{
        download: () => void;
    }>;
    exclude?: string[];
    extra?: ToolbarItemProps[];
    experimentalFeatures?: IExperimentalFeatures;
}
declare const _default: React.FunctionComponent<IVisualSettings>;
export default _default;
