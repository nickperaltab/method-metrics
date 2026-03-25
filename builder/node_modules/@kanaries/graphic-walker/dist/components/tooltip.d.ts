import React from 'react';
import { TooltipProvider } from "./ui/tooltip";
export default function Tooltip({ content, children, ...props }: React.ComponentPropsWithoutRef<typeof TooltipProvider> & {
    content?: React.ReactNode | Iterable<React.ReactNode>;
}): React.JSX.Element;
