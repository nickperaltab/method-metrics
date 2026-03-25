import React from 'react';
export declare const PixelCursor: (props: {
    color: string;
    dia: number;
    factor: number;
    style?: React.CSSProperties;
    className?: string;
}) => React.JSX.Element;
export type CursorDef = {
    type: 'circle';
    dia: number;
    factor: number;
} | {
    type: 'rect';
    x: number;
    xFactor: number;
    y: number;
    yFactor: number;
};
export declare const PixelContainer: (props: {
    color: string;
    cursor: CursorDef;
    offsetX: number;
    offsetY: number;
    children?: React.ReactNode | Iterable<React.ReactNode>;
    showPreview?: boolean;
}) => React.JSX.Element;
export declare const ClickInput: (props: {
    value: string;
    onChange: (v: string) => void;
}) => React.JSX.Element;
export declare const ColorEditor: (props: {
    color: string;
    onChangeColor: (color: string) => void;
    colors: string[];
}) => React.JSX.Element;
