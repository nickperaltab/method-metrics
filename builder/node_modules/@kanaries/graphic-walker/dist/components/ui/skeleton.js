import * as React from 'react';
import { cn } from "../../utils";
function Skeleton({ className, ...props }) {
    return React.createElement("div", { className: cn('animate-pulse rounded-md bg-primary/10', className), ...props });
}
export { Skeleton };
//# sourceMappingURL=skeleton.js.map