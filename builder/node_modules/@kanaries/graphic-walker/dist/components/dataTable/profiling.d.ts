import { IComputationFunction, ISemanticType } from '../../interfaces';
import React from 'react';
export interface FieldProfilingProps {
    field: string;
    computation: IComputationFunction;
}
export declare const FieldProfiling: (props: FieldProfilingProps & {
    semanticType: ISemanticType;
    displayOffset?: number | undefined;
    offset?: number | undefined;
} & {
    key?: React.Key | undefined;
}) => React.JSX.Element;
