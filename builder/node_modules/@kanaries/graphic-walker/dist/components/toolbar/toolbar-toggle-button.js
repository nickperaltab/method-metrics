import React, { memo } from 'react';
import { Toggle } from '../ui/toggle';
import { ToolbarItemContainer } from './container';
const ToolbarToggleButton = memo(function ToolbarToggleButton(props) {
    const { item } = props;
    const { icon: Icon, disabled, checked, onChange, styles } = item;
    return (React.createElement(ToolbarItemContainer, { ...props },
        React.createElement(Toggle, { variant: "none", disabled: disabled, size: "toolbar", pressed: checked, onPressedChange: onChange },
            React.createElement(Icon, { className: "w-[18px] h-[18px]", style: styles?.icon }))));
});
export default ToolbarToggleButton;
//# sourceMappingURL=toolbar-toggle-button.js.map