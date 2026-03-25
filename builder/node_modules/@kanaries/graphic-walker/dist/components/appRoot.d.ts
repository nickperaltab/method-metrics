import React, { type ComponentType, type RefObject } from "react";
import type { IGWHandlerInsider } from "../interfaces";
export declare const useAppRootContext: () => RefObject<IGWHandlerInsider>;
declare const AppRoot: React.ForwardRefExoticComponent<{
    children: any;
} & React.RefAttributes<IGWHandlerInsider>>;
export declare const withAppRoot: <P extends object>(Component: ComponentType<any>) => (props: P) => React.JSX.Element;
export default AppRoot;
