import { INestNode } from './inteface';
import { IField, IRow } from '../../interfaces';
import React from 'react';
declare class PivotTableStore {
    leftTree: INestNode | null;
    topTree: INestNode | null;
    metricTable: any[][];
    dataSource: IRow[];
    metas: IField[];
    viewData: IRow[];
    constructor();
    init(dataSource: IRow[], metas: IField[]): void;
}
export interface PivotTableDataProps {
    data: IRow[];
    metas: IField[];
    children?: React.ReactNode | Iterable<React.ReactNode>;
}
export declare const PivotTableStoreWrapper: React.FC<PivotTableDataProps>;
export declare function usePivotTableStore(): PivotTableStore;
export {};
