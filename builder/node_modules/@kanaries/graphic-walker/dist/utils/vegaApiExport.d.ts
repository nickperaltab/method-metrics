import { type ForwardedRef, type MutableRefObject, RefObject } from "react";
import type { IReactVegaHandler } from "../vis/react-vega";
import type { IVegaChartRef } from "../interfaces";
export declare const useVegaExportApi: (name: string | undefined, viewsRef: MutableRefObject<IVegaChartRef[]>, ref: ForwardedRef<IReactVegaHandler>, renderTaskRefs: MutableRefObject<Promise<unknown>[]>, containerRef: RefObject<HTMLDivElement>) => void;
