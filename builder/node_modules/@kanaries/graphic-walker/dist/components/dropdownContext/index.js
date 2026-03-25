import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}
const DropdownContext = (props) => {
    const { options = [], disable, position = 'start' } = props;
    return (React.createElement(DropdownMenu, null,
        React.createElement(DropdownMenuTrigger, { disabled: disable, asChild: true }, props.children),
        React.createElement(DropdownMenuContent, { align: position }, options.map((option, index) => (React.createElement(DropdownMenuItem, { key: option.value, onClick: () => {
                props.onSelect && !props.disable && props.onSelect(option.value, index);
            } }, option.label))))));
};
export default DropdownContext;
//# sourceMappingURL=index.js.map