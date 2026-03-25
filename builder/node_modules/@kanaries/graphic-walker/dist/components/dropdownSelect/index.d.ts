import React from 'react';
export interface IDropdownSelectOption {
    label: React.ReactNode;
    value: string;
}
export interface IDropdownSelectProps {
    options?: IDropdownSelectOption[];
    disable?: boolean;
    selectedKey: string;
    onSelect?: (value: string) => void;
    placeholder?: string;
    className?: string;
    buttonClassName?: string;
    children?: React.ReactNode | Iterable<React.ReactNode>;
}
declare const DropdownSelect: React.FC<IDropdownSelectProps>;
export default DropdownSelect;
