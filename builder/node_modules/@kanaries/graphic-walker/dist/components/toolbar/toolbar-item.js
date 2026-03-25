import React, { memo } from 'react';
import ToolbarButton from './toolbar-button';
import ToolbarToggleButton from './toolbar-toggle-button';
import ToolbarSelectButton from './toolbar-select-button';
export const ToolbarItemSplitter = '-';
const ToolbarItem = memo(function ToolbarItem(props) {
    if ('checked' in props.item) {
        return React.createElement(ToolbarToggleButton, { item: props.item, openedKey: props.openedKey, setOpenedKey: props.setOpenedKey });
    }
    else if ('options' in props.item) {
        return React.createElement(ToolbarSelectButton, { item: props.item, openedKey: props.openedKey, setOpenedKey: props.setOpenedKey });
    }
    return React.createElement(ToolbarButton, { ...props });
});
export default ToolbarItem;
//# sourceMappingURL=toolbar-item.js.map