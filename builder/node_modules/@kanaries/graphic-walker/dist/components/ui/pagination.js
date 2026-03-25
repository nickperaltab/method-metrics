import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, DotsHorizontalIcon } from '@radix-ui/react-icons';
import { cn } from "../../utils";
import { buttonVariants } from "./button";
const Pagination = ({ className, ...props }) => (React.createElement("nav", { role: "navigation", "aria-label": "pagination", className: cn('mx-auto flex w-full justify-center', className), ...props }));
Pagination.displayName = 'Pagination';
const PaginationContent = React.forwardRef(({ className, ...props }, ref) => (React.createElement("ul", { ref: ref, className: cn('flex flex-row items-center gap-1', className), ...props })));
PaginationContent.displayName = 'PaginationContent';
const PaginationItem = React.forwardRef(({ className, ...props }, ref) => (React.createElement("li", { ref: ref, className: cn('cursor-pointer', className), ...props })));
PaginationItem.displayName = 'PaginationItem';
const PaginationLink = ({ className, isActive, size = 'icon', ...props }) => (React.createElement("a", { "aria-current": isActive ? 'page' : undefined, className: cn(buttonVariants({
        variant: isActive ? 'outline' : 'ghost',
        size,
    }), className), ...props }));
PaginationLink.displayName = 'PaginationLink';
const PaginationPrevious = ({ className, children, ...props }) => (React.createElement(PaginationLink, { "aria-label": "Go to previous page", size: "default", className: cn('gap-1 pl-2.5', className), ...props },
    React.createElement(ChevronLeftIcon, { className: "h-4 w-4" }),
    React.createElement("span", null, children)));
PaginationPrevious.displayName = 'PaginationPrevious';
const PaginationNext = ({ className, children, ...props }) => (React.createElement(PaginationLink, { "aria-label": "Go to next page", size: "default", className: cn('gap-1 pr-2.5', className), ...props },
    React.createElement("span", null, children),
    React.createElement(ChevronRightIcon, { className: "h-4 w-4" })));
PaginationNext.displayName = 'PaginationNext';
const PaginationEllipsis = ({ className, ...props }) => (React.createElement("span", { "aria-hidden": true, className: cn('flex h-9 w-9 items-center justify-center', className), ...props },
    React.createElement(DotsHorizontalIcon, { className: "h-4 w-4" }),
    React.createElement("span", { className: "sr-only" }, "More pages")));
PaginationEllipsis.displayName = 'PaginationEllipsis';
export { Pagination, PaginationContent, PaginationLink, PaginationItem, PaginationPrevious, PaginationNext, PaginationEllipsis };
//# sourceMappingURL=pagination.js.map