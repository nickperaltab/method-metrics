import React from 'react';
import { VizSpecStore } from './visualSpecStore';
import { IComputationFunction, IDefaultConfig, IMutField } from '../interfaces';
export declare const VisContext: React.Context<VizSpecStore>;
interface VizStoreWrapperProps {
    keepAlive?: boolean | string;
    storeRef?: React.MutableRefObject<VizSpecStore | null>;
    children?: React.ReactNode;
    meta: IMutField[];
    onMetaChange?: (fid: string, meta: Partial<IMutField>) => void;
    defaultConfig?: IDefaultConfig;
    defaultRenderer?: 'vega-lite' | 'observable-plot';
}
export declare const VizStoreWrapper: (props: VizStoreWrapperProps) => React.JSX.Element;
export declare function useVizStore(): VizSpecStore;
export declare const ComputationContext: React.Context<IComputationFunction>;
export declare function useCompututaion(): IComputationFunction;
export declare function withTimeout<T extends any[], U>(f: (...args: T) => Promise<U>, timeout: number): (...args: T) => Promise<Awaited<U>>;
export declare function withErrorReport<T extends any[], U>(f: (...args: T) => Promise<U>, onError: (err: string | Error) => void): (...args: T) => Promise<U>;
export {};
