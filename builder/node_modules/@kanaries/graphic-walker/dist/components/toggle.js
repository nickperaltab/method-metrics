import React from 'react';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
export default function Toggle(props) {
    const { enabled, onChange, label } = props;
    return (React.createElement("div", { className: "flex items-center space-x-2" },
        React.createElement(Switch, { id: label, checked: enabled, onCheckedChange: onChange }),
        React.createElement(Label, { htmlFor: label }, label)));
}
//# sourceMappingURL=toggle.js.map