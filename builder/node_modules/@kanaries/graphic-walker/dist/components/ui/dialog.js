import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Cross2Icon } from '@radix-ui/react-icons';
import { cn } from "../../utils";
import { portalContainerContext } from "../../store/theme";
import { ScrollArea } from './scroll-area';
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (React.createElement("div", { ref: ref, className: cn('fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className), ...props })));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
const DialogContent = React.forwardRef(({ className, containerClassName, children, ...props }, ref) => (React.createElement(DialogPortal, { container: React.useContext(portalContainerContext) },
    React.createElement(DialogOverlay, null),
    React.createElement(DialogPrimitive.Content, { ref: ref, className: cn('fixed left-[50%] top-[50%] z-50 grid w-[98%] sm:w-[80%] lg:w-[880px] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden', className), ...props },
        React.createElement(ScrollArea, { className: cn('overscroll-none max-h-[calc(min(800px,90vh))] w-full relative p-6', containerClassName) }, children),
        React.createElement(DialogPrimitive.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground" },
            React.createElement(Cross2Icon, { className: "h-4 w-4" }),
            React.createElement("span", { className: "sr-only" }, "Close"))))));
DialogContent.displayName = DialogPrimitive.Content.displayName;
const DialogNormalContent = React.forwardRef(({ className, containerClassName, children, ...props }, ref) => (React.createElement(DialogPortal, { container: React.useContext(portalContainerContext) },
    React.createElement(DialogOverlay, null),
    React.createElement(DialogPrimitive.Content, { ref: ref, className: cn('fixed left-[50%] top-[50%] z-50 grid w-[98%] sm:w-[80%] lg:w-[880px] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden', className), ...props },
        children,
        React.createElement(DialogPrimitive.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground" },
            React.createElement(Cross2Icon, { className: "h-4 w-4" }),
            React.createElement("span", { className: "sr-only" }, "Close"))))));
DialogNormalContent.displayName = DialogPrimitive.Content.displayName;
const DialogHeader = ({ className, ...props }) => (React.createElement("div", { className: cn('flex flex-col space-y-1.5 text-center sm:text-left', className), ...props }));
DialogHeader.displayName = 'DialogHeader';
const DialogFooter = ({ className, ...props }) => (React.createElement("div", { className: cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className), ...props }));
DialogFooter.displayName = 'DialogFooter';
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (React.createElement(DialogPrimitive.Title, { ref: ref, className: cn('text-lg font-semibold leading-none tracking-tight', className), ...props })));
DialogTitle.displayName = DialogPrimitive.Title.displayName;
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => React.createElement(DialogPrimitive.Description, { ref: ref, className: cn('text-sm text-muted-foreground', className), ...props }));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
export { Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose, DialogContent, DialogNormalContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, };
//# sourceMappingURL=dialog.js.map