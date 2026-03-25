import React from 'react';
import type { IFilterField, IFilterRule, IFieldStats, IMutField, IComputationFunction, IKeyWord } from '../../interfaces';
import { SparseArray } from './array';
export type RuleFormProps = {
    allFields: IMutField[];
    field: IFilterField;
    onChange: (rule: IFilterRule) => void;
    displayOffset?: number;
};
export declare const useFieldStats: (field: IFilterField, attributes: {
    values: boolean;
    range: boolean;
    valuesMeta?: boolean;
    selectedCount?: any[];
    displayOffset?: number;
    keyword?: IKeyWord;
}, sortBy: 'value' | 'value_dsc' | 'count' | 'count_dsc' | 'none', computation: IComputationFunction, allFields: IMutField[]) => [IFieldStats | null, IFieldStats | null];
type RowCount = {
    value: string | number;
    count: number;
};
export declare const useVisualCount: (field: IFilterField, sortBy: 'value' | 'value_dsc' | 'count' | 'count_dsc' | 'none', computation: IComputationFunction, onChange: (rule: IFilterRule) => void, allFields: IMutField[], options: {
    displayOffset: number | undefined;
    keyword?: IKeyWord;
}) => {
    total: number | undefined;
    distinctTotal: number | undefined;
    currentRows: number | undefined;
    currentCount: number;
    currentSum: number;
    handleToggleFullOrEmptySet: () => void;
    handleToggleReverseSet: () => void;
    handleToggleCurrentFullSet: () => Promise<void>;
    handleSelect: (value: string | number, checked: boolean, itemNum: number) => void;
    data: SparseArray<RowCount>;
    loadData: (index: number) => void;
    loading: boolean;
    loadingPageData: boolean;
    loadingSelectAll: boolean;
};
export declare const FilterOneOfRule: React.FC<RuleFormProps & {
    active: boolean;
}>;
interface CalendarInputProps {
    min: number;
    max: number;
    displayOffset?: number;
    value: number;
    onChange: (value: number) => void;
    className?: string;
}
export declare const CalendarInput: React.FC<CalendarInputProps>;
export declare const FilterTemporalRangeRule: React.FC<RuleFormProps & {
    active: boolean;
}>;
export declare const FilterRangeRule: React.FC<RuleFormProps & {
    active: boolean;
}>;
export interface TabsProps extends RuleFormProps {
    tabs: IFilterRule['type'][];
}
declare const Tabs: React.FC<TabsProps>;
export default Tabs;
