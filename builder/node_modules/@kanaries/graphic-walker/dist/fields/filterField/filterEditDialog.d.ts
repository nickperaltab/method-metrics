import React from 'react';
import type { IAggregator, IFilterField, IFilterRule, IMutField } from '../../interfaces';
export declare const PureFilterEditDialog: (props: {
    viewFilters: IFilterField[];
    options: {
        label: string;
        value: string;
    }[];
    meta: IMutField[];
    editingFilterIdx: number | null;
    displayOffset?: number | undefined;
    onSelectFilter: (field: string) => void;
    onWriteFilter: (index: number, rule: IFilterRule | null) => void;
    onSelectAgg?: ((index: number, aggName: IAggregator | null) => void) | undefined;
    onClose: () => void;
}) => React.JSX.Element | null;
declare const FilterEditDialog: React.FC;
export default FilterEditDialog;
