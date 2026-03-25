import React, { type ReactElement } from 'react';
export interface IActionMenuItem {
    icon?: ReactElement;
    label: string;
    disabled?: boolean;
    children?: IActionMenuItem[];
    onPress?: () => void;
}
interface IActionMenuItemListProps {
    title?: string;
    items: IActionMenuItem[];
    path: number[];
}
declare const _default: React.NamedExoticComponent<Omit<IActionMenuItemListProps, "path"> & {
    onDismiss: () => void;
}>;
export default _default;
