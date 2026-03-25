import React, { memo } from 'react';
import { Button, buttonVariants } from '../ui/button';
import { ToolbarItemContainer } from './container';
const ToolbarButton = memo(function ToolbarButton(props) {
    const { item } = props;
    const { icon: Icon, styles, disabled, onClick, href } = item;
    return (React.createElement(ToolbarItemContainer, { ...props, splitOnly: !onClick },
        href && (React.createElement("a", { href: href, target: "_blank", className: buttonVariants({ variant: 'none', size: 'toolbar' }), "aria-disabled": disabled },
            React.createElement(Icon, { className: "w-[18px] h-[18px]", style: styles?.icon }))),
        !href && (React.createElement(Button, { variant: "none", size: "toolbar", onClick: onClick, disabled: disabled },
            React.createElement(Icon, { className: "w-[18px] h-[18px]", style: styles?.icon })))));
});
export default ToolbarButton;
//# sourceMappingURL=toolbar-button.js.map