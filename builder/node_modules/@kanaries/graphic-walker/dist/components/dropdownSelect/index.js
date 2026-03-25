import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
const DropdownSelect = (props) => {
    const { options = [], disable, selectedKey, onSelect, placeholder = 'Select an option', className } = props;
    return (React.createElement(Select, { disabled: disable, value: selectedKey, onValueChange: (newKey) => {
            if (newKey === '_none') {
                onSelect?.('');
            }
            else {
                onSelect?.(newKey);
            }
        } },
        React.createElement(SelectTrigger, { className: className },
            React.createElement(SelectValue, { placeholder: placeholder })),
        React.createElement(SelectContent, null, options.map((op) => (React.createElement(SelectItem, { key: op.value, value: op.value }, op.label))))));
};
export default DropdownSelect;
//# sourceMappingURL=index.js.map