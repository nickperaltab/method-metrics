import React from 'react';
import { IToolbarItem, IToolbarProps } from './toolbar-item';
export interface ToolbarButtonItem extends IToolbarItem {
    onClick?: () => void;
    href?: string;
}
declare const ToolbarButton: React.NamedExoticComponent<IToolbarProps<ToolbarButtonItem>>;
export default ToolbarButton;
