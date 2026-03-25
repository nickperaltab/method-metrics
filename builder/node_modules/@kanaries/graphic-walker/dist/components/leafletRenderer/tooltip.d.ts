import React from "react";
import type { DeepReadonly, IViewField, VegaGlobalConfig } from "../../interfaces";
export interface ITooltipContentProps {
    allFields: readonly DeepReadonly<IViewField>[];
    vegaConfig: VegaGlobalConfig;
    field: DeepReadonly<IViewField>;
    value: unknown;
}
export declare const TooltipContent: React.NamedExoticComponent<ITooltipContentProps>;
