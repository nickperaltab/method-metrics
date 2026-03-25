import React from 'react';
import type { IMutField, IComputationFunction, IVisFilter } from '../../interfaces';
interface DataTableProps {
    /** page limit */
    size?: number;
    metas: IMutField[];
    computation: IComputationFunction;
    onMetaChange?: (fid: string, fIndex: number, meta: Partial<IMutField>) => void;
    disableFilter?: boolean;
    disableSorting?: boolean;
    hideSemanticType?: boolean;
    hideProfiling?: boolean;
    hidePaginationAtOnepage?: boolean;
    displayOffset?: number;
}
declare const DataTable: React.ForwardRefExoticComponent<DataTableProps & React.RefAttributes<{
    getFilters: () => IVisFilter[];
}>>;
export default DataTable;
