import React from 'react';
import { IAppI18nProps, IErrorHandlerProps, IComputationContextProps, ITableProps, ITableSpecProps, IComputationProps } from './interfaces';
export type BaseTableProps = IAppI18nProps & IErrorHandlerProps & IComputationContextProps & ITableSpecProps & {
    darkMode?: 'light' | 'dark';
};
export declare const TableApp: React.FunctionComponent<BaseTableProps>;
export declare function TableAppWithContext(props: ITableProps & IComputationProps): React.JSX.Element;
