import React from 'react';
import { Spec } from 'vega';
interface GenVegaProps {
    dataSource: any[];
    spec: Spec;
    signalHandler?: {
        [key: string]: (name: any, value: any) => void;
    };
}
declare const GenVega: React.FC<GenVegaProps>;
export default GenVega;
