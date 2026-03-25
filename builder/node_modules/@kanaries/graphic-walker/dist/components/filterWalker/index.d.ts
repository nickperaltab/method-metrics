import React from 'react';
import { IComputationFunction, IMutField, IRow, IVisFilter } from '../../interfaces';
type rangeValue = [number, number];
export interface FilterConfig {
    fid: string;
    mode: 'single' | 'multi' | 'range';
    defaultValue?: string | string[] | [number, number];
}
export interface SingleProps {
    name: string;
    options: string[];
    value: string | undefined;
    onChange?: (v: string | undefined) => void;
}
export interface MultiProps {
    name: string;
    options: string[];
    value: string[];
    onChange?: (v: string[]) => void;
}
export interface RangeProps {
    name: string;
    domain: rangeValue;
    value: rangeValue;
    onChange?: (v: rangeValue) => void;
}
export declare function createFilterContext(components: {
    SingleSelect: React.FunctionComponent<SingleProps> | React.ComponentClass<SingleProps, any>;
    MultiSelect: React.FunctionComponent<MultiProps> | React.ComponentClass<MultiProps, any>;
    RangeSelect: React.FunctionComponent<RangeProps> | React.ComponentClass<RangeProps, any>;
    TemporalSelect: React.FunctionComponent<RangeProps> | React.ComponentClass<RangeProps, any>;
}): {
    (props: {
        configs: FilterConfig[];
        data: IRow[];
        loadingContent?: React.ReactNode | Iterable<React.ReactNode>;
        fields: IMutField[];
        children: (computation: IComputationFunction, filterComponents: JSX.Element[]) => React.ReactNode;
    }): JSX.Element;
    (props: {
        configs: FilterConfig[];
        computation: IComputationFunction;
        loadingContent?: React.ReactNode | Iterable<React.ReactNode>;
        fields: IMutField[];
        children: (computation: IComputationFunction, filterComponents: JSX.Element[]) => React.ReactNode;
    }): JSX.Element;
};
export declare const useTemporalFilter: (computation: IComputationFunction, fid: string, initValue?: rangeValue | (() => rangeValue), offset?: number) => {
    filter: IVisFilter | null;
    domain: rangeValue;
    value: rangeValue;
    setValue: (v: rangeValue) => void;
};
export declare const useQuantitativeFilter: (computation: IComputationFunction, fid: string, initValue?: rangeValue | (() => rangeValue)) => {
    filter: IVisFilter | null;
    domain: rangeValue;
    value: rangeValue;
    setValue: (v: rangeValue) => void;
};
export declare const useNominalFilter: (computation: IComputationFunction, fid: string, initValue: string[] | (() => string[])) => {
    filter: IVisFilter | null;
    domain: string[];
    value: string[];
    setValue: (v: string[]) => void;
};
export {};
