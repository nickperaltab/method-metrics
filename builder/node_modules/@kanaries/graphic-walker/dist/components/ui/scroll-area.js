import * as React from 'react';
import { cn } from "../../utils";
const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (React.createElement("div", { ref: ref, className: cn('relative overflow-auto dark:[color-scheme:dark]', className), ...props }, children)));
export { ScrollArea };
//# sourceMappingURL=scroll-area.js.map