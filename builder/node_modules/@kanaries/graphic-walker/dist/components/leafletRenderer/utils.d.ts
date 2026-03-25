import type { ISemanticType, VegaGlobalConfig } from "../../interfaces";
import type { LatLngBoundsExpression } from 'leaflet';
export declare const useDisplayValueFormatter: (semanticType: ISemanticType, vegaConfig: VegaGlobalConfig) => (value: unknown) => string;
export declare function ChangeView({ bounds }: {
    bounds: LatLngBoundsExpression;
}): null;
