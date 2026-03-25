import React, { CSSProperties } from 'react';
export declare const FieldListContainer: React.FC<{
    name: string;
    style?: Omit<CSSProperties, 'translate'>;
    children?: React.ReactNode | Iterable<React.ReactNode>;
}>;
export declare const AestheticFieldContainer: React.FC<{
    name: string;
    style?: CSSProperties;
    children?: React.ReactNode | Iterable<React.ReactNode>;
}>;
export declare const FilterFieldContainer: React.FC<{
    children?: React.ReactNode | Iterable<React.ReactNode>;
}>;
export declare const FieldsContainer: import("styled-components").StyledComponent<"div", any, {}, never>;
export declare const FilterFieldsContainer: import("styled-components").StyledComponent<"div", any, {}, never>;
export declare const FieldListSegment: import("styled-components").StyledComponent<"div", any, {}, never>;
export declare const FilterFieldSegment: import("styled-components").StyledComponent<"div", any, {}, never>;
export declare const Pill: import("styled-components").StyledComponent<"div", any, {
    colType: 'discrete' | 'continuous';
}, never>;
