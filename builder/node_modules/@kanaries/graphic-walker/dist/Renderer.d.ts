import React from 'react';
import { IAppI18nProps, IVizProps, IErrorHandlerProps, IVizAppProps, ISpecProps, IComputationContextProps, IComputationProps, IVisualLayout } from './interfaces';
type BaseVizProps = IAppI18nProps & IVizProps & IErrorHandlerProps & ISpecProps & IComputationContextProps & {
    darkMode?: 'light' | 'dark';
    overrideSize?: IVisualLayout['size'];
    containerClassName?: string;
    containerStyle?: React.CSSProperties;
};
export declare const RendererApp: React.FunctionComponent<BaseVizProps>;
export declare function RendererAppWithContext(props: IVizAppProps & IComputationProps & {
    overrideSize?: IVisualLayout['size'];
    containerClassName?: string;
    containerStyle?: React.CSSProperties;
}): React.JSX.Element;
export {};
