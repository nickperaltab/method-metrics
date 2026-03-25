import React from 'react';
import { IToolbarItem, IToolbarProps } from './toolbar-item';
export interface ToolbarSelectButtonItem<T extends string = string> extends IToolbarItem {
    options: {
        key: T;
        icon: (props: React.SVGProps<SVGSVGElement> & {
            title?: string | undefined;
            titleId?: string | undefined;
        }) => JSX.Element;
        label: string;
        /** @default false */
        disabled?: boolean;
    }[];
    value: T;
    onSelect: (value: T) => void;
}
declare const ToolbarSelectButton: React.NamedExoticComponent<IToolbarProps<ToolbarSelectButtonItem<string>>>;
export default ToolbarSelectButton;
