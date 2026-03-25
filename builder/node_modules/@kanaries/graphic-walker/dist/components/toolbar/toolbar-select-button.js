import React, { memo } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { ToolbarItemContainer } from './container';
import { produce } from 'immer';
const ToolbarSelectButton = memo(function ToolbarSelectButton(props) {
    const { item, openedKey, setOpenedKey } = props;
    const { key, icon: Icon, disabled, options, value, onSelect, styles } = item;
    const id = `${key}::button`;
    const opened = openedKey === id;
    const currentOption = options.find((opt) => opt.key === value);
    const CurrentIcon = currentOption?.icon;
    return (React.createElement(DropdownMenu, { modal: false, open: opened, onOpenChange: (open) => (open ? setOpenedKey(id) : setOpenedKey('')) },
        React.createElement(ToolbarItemContainer, { ...props, item: produce(props.item, (draft) => {
                if (currentOption) {
                    draft.label = `${draft.label}: ${currentOption.label}`;
                }
            }) },
            React.createElement(DropdownMenuTrigger, { disabled: disabled, asChild: true },
                React.createElement(Button, { className: "relative", disabled: disabled, variant: "none", size: "toolbar" },
                    React.createElement(Icon, { className: "w-[18px] h-[18px]", style: styles?.icon }),
                    CurrentIcon && React.createElement(CurrentIcon, { style: styles?.icon, className: "absolute w-[11px] h-[11px] right-[7px] bottom-[5px]" })))),
        React.createElement(DropdownMenuContent, { onCloseAutoFocus: e => e.preventDefault() },
            React.createElement(DropdownMenuRadioGroup, { value: value, onValueChange: onSelect }, options.map((option) => {
                const OptionIcon = option.icon;
                return (React.createElement(DropdownMenuRadioItem, { key: option.key, value: option.key, className: "gap-2" },
                    React.createElement(OptionIcon, { className: "w-[18px] h-[18px]" }),
                    option.label));
            })))));
});
export default ToolbarSelectButton;
//# sourceMappingURL=toolbar-select-button.js.map