import React from 'react';
import { Tooltip as TooltipRoot, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
export default function Tooltip({ content, children, ...props }) {
    return (React.createElement(TooltipProvider, { ...props },
        React.createElement(TooltipRoot, null,
            React.createElement(TooltipTrigger, { asChild: true }, children),
            React.createElement(TooltipContent, null, content))));
}
//# sourceMappingURL=tooltip.js.map