import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Cog6ToothIcon } from '@heroicons/react/24/solid';
import { TooltipProvider, TooltipContent, TooltipTrigger, Tooltip } from '../ui/tooltip';
import { Button } from '../ui/button';
export function ToolbarItemContainer(props) {
    const { openedKey, setOpenedKey, children, item } = props;
    const { key, disabled, form, label, styles } = item;
    const id = `${key}::form`;
    const opened = form && id === openedKey && !disabled;
    const splitOnly = form && props.splitOnly;
    return (React.createElement(Popover, { open: opened, onOpenChange: (open) => (open ? setOpenedKey(id) : setOpenedKey(null)) },
        React.createElement(TooltipProvider, null,
            React.createElement(Tooltip, null,
                React.createElement(TooltipTrigger, { asChild: true },
                    React.createElement(PopoverTrigger, { asChild: true },
                        React.createElement("div", { className: "m-0.5 rounded-md flex transition-colors hover:bg-muted hover:text-muted-foreground", style: styles?.item },
                            React.createElement("div", { onClick: splitOnly ? undefined : (e) => e.stopPropagation() }, children),
                            form && (React.createElement(Button, { variant: "none", size: "none", className: "cursor-pointer group flex items-center h-8 mr-1" },
                                React.createElement(Cog6ToothIcon, { style: styles?.splitIcon, className: "group-hover:translate-y-[40%] transition-transform w-2.5 h-2.5" })))))),
                form && React.createElement(PopoverContent, { className: "p-0 w-fit" }, form),
                React.createElement(TooltipContent, { hideWhenDetached: true }, label)))));
}
//# sourceMappingURL=container.js.map