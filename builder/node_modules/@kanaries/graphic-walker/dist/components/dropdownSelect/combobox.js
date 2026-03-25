import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from "../../utils";
import { Button } from '../ui/button';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from '../ui/command';
import { CaretSortIcon, CheckIcon } from '@radix-ui/react-icons';
import { ScrollArea } from '../ui/scroll-area';
import React from 'react';
function Combobox({ options = [], selectedKey: value, onSelect, className, popClassName, placeholder = 'Select A Value', }) {
    const [open, setOpen] = useState(false);
    const selectedKey = value || '_none';
    return (React.createElement(Popover, { open: open, onOpenChange: setOpen },
        React.createElement(PopoverTrigger, { asChild: true },
            React.createElement(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: cn('flex justify-between', className) },
                React.createElement("div", { className: "shrink min-w-[0px] overflow-hidden text-ellipsis whitespace-nowrap" }, options.find((opt) => opt.value === selectedKey)?.label ?? placeholder),
                React.createElement(CaretSortIcon, { className: "ml-2 h-4 w-4 shrink-0 opacity-50" }))),
        React.createElement(PopoverContent, { className: cn('p-0', popClassName) },
            React.createElement(Command, null,
                React.createElement(CommandInput, { placeholder: "Search...", className: "h-9" }),
                React.createElement(CommandEmpty, null, "No options found."),
                React.createElement(ScrollArea, { className: "h-min max-h-48" },
                    React.createElement(CommandGroup, null, options.map((opt) => (React.createElement(CommandItem, { key: opt.value, value: opt.value, onSelect: () => {
                            if (opt.value === '_none') {
                                onSelect?.('');
                            }
                            else {
                                onSelect?.(opt.value === selectedKey ? '' : opt.value);
                            }
                            setOpen(false);
                        } },
                        opt.label,
                        React.createElement(CheckIcon, { className: cn('ml-auto h-4 w-4', selectedKey === opt.value ? 'opacity-100' : 'opacity-0') }))))))))));
}
export default Combobox;
//# sourceMappingURL=combobox.js.map