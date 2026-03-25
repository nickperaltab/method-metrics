import React from 'react';
import type { IGWHandler, ITableProps, IVizAppProps, ILocalComputationProps, IRemoteComputationProps, IVisualLayout } from './interfaces';
import './empty_sheet.css';
export type ILocalVizAppProps = IVizAppProps & ILocalComputationProps & React.RefAttributes<IGWHandler> & {
    className?: string;
    style?: React.CSSProperties;
};
export type IRemoteVizAppProps = IVizAppProps & IRemoteComputationProps & React.RefAttributes<IGWHandler> & {
    className?: string;
    style?: React.CSSProperties;
};
export declare const GraphicWalker: {
    (p: ILocalVizAppProps): JSX.Element;
    (p: IRemoteVizAppProps): JSX.Element;
};
export type IRendererProps = {
    containerClassName?: string;
    containerStyle?: React.CSSProperties;
    overrideSize?: IVisualLayout['size'];
};
export declare const GraphicRenderer: {
    (p: ILocalVizAppProps & IRendererProps): JSX.Element;
    (p: IRemoteVizAppProps & IRendererProps): JSX.Element;
};
export type ILocalTableProps = ITableProps & ILocalComputationProps & React.RefAttributes<IGWHandler> & {
    className?: string;
    style?: React.CSSProperties;
};
export type IRemoteTableProps = ITableProps & IRemoteComputationProps & React.RefAttributes<IGWHandler> & {
    className?: string;
    style?: React.CSSProperties;
};
export declare const TableWalker: {
    (p: ILocalTableProps): JSX.Element;
    (p: IRemoteTableProps): JSX.Element;
};
