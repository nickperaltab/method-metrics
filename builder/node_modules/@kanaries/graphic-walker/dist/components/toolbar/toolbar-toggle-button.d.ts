import React from 'react';
import { IToolbarItem, IToolbarProps } from './toolbar-item';
export interface ToolbarToggleButtonItem extends IToolbarItem {
    checked: boolean;
    onChange: (checked: boolean) => void;
}
declare const ToolbarToggleButton: React.NamedExoticComponent<IToolbarProps<ToolbarToggleButtonItem>>;
export default ToolbarToggleButton;
