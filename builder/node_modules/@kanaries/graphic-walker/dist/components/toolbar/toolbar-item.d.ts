import React from 'react';
import { ToolbarButtonItem } from './toolbar-button';
import { ToolbarToggleButtonItem } from './toolbar-toggle-button';
import { ToolbarSelectButtonItem } from './toolbar-select-button';
import { ToolbarProps } from '.';
export interface IToolbarItem {
    key: string;
    icon: (props: React.ComponentProps<'svg'> & {
        title?: string;
        titleId?: string;
    }) => JSX.Element;
    label: string;
    /** @default false */
    disabled?: boolean;
    form?: JSX.Element;
    styles?: ToolbarProps['styles'];
}
export declare const ToolbarItemSplitter = "-";
export type ToolbarItemProps = ToolbarButtonItem | ToolbarToggleButtonItem | ToolbarSelectButtonItem | typeof ToolbarItemSplitter;
export interface IToolbarProps<P extends Exclude<ToolbarItemProps, typeof ToolbarItemSplitter> = Exclude<ToolbarItemProps, typeof ToolbarItemSplitter>> {
    item: P;
    openedKey: string | null;
    setOpenedKey: (key: string | null) => void;
}
declare const ToolbarItem: React.NamedExoticComponent<{
    item: Exclude<ToolbarItemProps, typeof ToolbarItemSplitter>;
    openedKey: string | null;
    setOpenedKey: (key: string | null) => void;
}>;
export default ToolbarItem;
