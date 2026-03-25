/**
 * TODO: This file will be used when vega-lite facets bug is fixed.
 * https://github.com/vega/vega-lite/issues/4680
 */
import React from 'react';
import { IField, IRow } from '../interfaces';
interface ReactVegaProps {
    rows: IField[];
    columns: IField[];
    dataSource: IRow[];
    defaultAggregate?: boolean;
    geomType: string;
    color?: IField;
    opacity?: IField;
    size?: IField;
    onGeomClick?: (values: any, e: any) => void;
}
declare const ReactVega: React.FC<ReactVegaProps>;
export default ReactVega;
