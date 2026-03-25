import React from 'react';
import { IDropdownSelectProps } from '.';
declare function Combobox({ options, selectedKey: value, onSelect, className, popClassName, placeholder, }: IDropdownSelectProps & {
    popClassName?: string;
}): React.JSX.Element;
export default Combobox;
