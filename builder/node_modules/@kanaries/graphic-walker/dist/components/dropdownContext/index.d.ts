import React from 'react';
export interface IDropdownContextOption {
    label: string;
    value: string;
    disabled?: boolean;
}
interface IDropdownContextProps {
    options?: IDropdownContextOption[];
    disable?: boolean;
    onSelect?: (value: string, index: number) => void;
    position?: 'center' | 'end' | 'start';
    children?: React.ReactNode | Iterable<React.ReactNode>;
}
declare const DropdownContext: React.FC<IDropdownContextProps>;
export default DropdownContext;
