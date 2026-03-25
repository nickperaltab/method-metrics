import React from 'react';
export interface ISelectContextOption {
    key: string;
    label: string;
    disabled?: boolean;
}
interface ISelectContextProps {
    options?: ISelectContextOption[];
    disable?: boolean;
    selectedKeys?: string[];
    onSelect?: (selectedKeys: string[]) => void;
    className?: string;
    required?: boolean;
    children?: React.ReactNode | Iterable<React.ReactNode>;
}
declare const SelectContext: React.FC<ISelectContextProps>;
export default SelectContext;
