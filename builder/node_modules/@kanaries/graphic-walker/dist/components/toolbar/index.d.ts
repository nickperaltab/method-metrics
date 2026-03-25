import React, { CSSProperties } from 'react';
import { ToolbarItemProps } from './toolbar-item';
export interface ToolbarProps {
    items: ToolbarItemProps[];
    styles?: Partial<{
        item: CSSProperties & Record<string, string>;
        icon: CSSProperties & Record<string, string>;
        splitIcon: CSSProperties & Record<string, string>;
    }>;
}
declare const Toolbar: React.NamedExoticComponent<ToolbarProps>;
export default Toolbar;
export type { ToolbarItemProps };
