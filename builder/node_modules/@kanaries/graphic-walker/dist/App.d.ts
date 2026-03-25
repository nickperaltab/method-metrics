import React from 'react';
import { IAppI18nProps, IVizProps, IErrorHandlerProps, IVizAppProps, ISpecProps, IComputationContextProps, IComputationProps } from './interfaces';
export type BaseVizProps = IAppI18nProps & IVizProps & IErrorHandlerProps & ISpecProps & IComputationContextProps & {
    darkMode?: 'light' | 'dark';
};
export declare const VizApp: React.FunctionComponent<BaseVizProps>;
export declare function VizAppWithContext(props: IVizAppProps & IComputationProps): React.JSX.Element;
