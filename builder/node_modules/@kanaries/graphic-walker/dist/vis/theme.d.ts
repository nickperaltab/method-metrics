import { VegaGlobalConfig } from '../interfaces';
export type GWGlobalConfig<T extends VegaGlobalConfig = VegaGlobalConfig & {
    scale?: {
        continuous: {
            range: string[];
        };
    };
}> = {
    light: T;
    dark: T;
};
export declare const DEFAULT_COLOR = "#5B8FF9";
export declare const VegaTheme: {
    readonly light: {
        readonly background: "transparent";
        readonly boxplot: {
            readonly ticks: true;
        };
    };
    readonly dark: import("vega-typings").Config & import("vega-lite").Config<import("vega-lite/build/src/expr").ExprRef | import("vega-typings").SignalRef> & {
        leafletGeoTileUrl?: string | undefined;
    } & {
        scale?: {
            continuous: {
                range: string[];
            };
        } | undefined;
    };
};
/**
 * Copyright (c) Streamlit Inc. (2018-2022) Snowflake Inc. (2022-2024)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export declare const StreamlitTheme: {
    light: {
        font: string;
        background: string;
        fieldTitle: string;
        title: {
            align: string;
            anchor: string;
            color: string;
            titleFontStyle: string;
            fontWeight: number;
            fontSize: number;
            orient: string;
            offset: number;
        };
        header: {
            titleFontWeight: number;
            titleFontSize: number;
            titleColor: string;
            titleFontStyle: string;
            labelFontSize: number;
            labelFontWeight: number;
            labelColor: string;
            labelFontStyle: string;
        };
        axis: {
            labelFontSize: number;
            labelFontWeight: number;
            labelColor: string;
            labelFontStyle: string;
            titleFontWeight: number;
            titleFontSize: number;
            titleColor: string;
            titleFontStyle: string;
            ticks: boolean;
            gridColor: string;
            domain: boolean;
            domainWidth: number;
            domainColor: string;
            labelFlush: boolean;
            labelFlushOffset: number;
            labelBound: boolean;
            labelLimit: number;
            titlePadding: number;
            labelPadding: number;
            labelSeparation: number;
            labelOverlap: boolean;
        };
        legend: {
            labelFontSize: number;
            labelFontWeight: number;
            labelColor: string;
            titleFontSize: number;
            titleFontWeight: number;
            titleFontStyle: string;
            titleColor: string;
            titlePadding: number;
            labelPadding: number;
            columnPadding: number;
            rowPadding: number;
            padding: number;
            symbolStrokeWidth: number;
        };
        range: {
            category: string[];
            diverging: string[];
            ramp: string[];
            heatmap: string[];
        };
        view: {
            columns: number;
            strokeWidth: number;
            stroke: string;
            continuousHeight: number;
            continuousWidth: number;
        };
        concat: {
            columns: number;
        };
        facet: {
            columns: number;
        };
        mark: {
            tooltip: boolean;
            color: string;
        };
        bar: {
            binSpacing: number;
            discreteBandSize: {
                band: number;
            };
        };
        boxplot: {
            ticks: boolean;
        };
        axisDiscrete: {
            grid: boolean;
        };
        axisXPoint: {
            grid: boolean;
        };
        axisTemporal: {
            grid: boolean;
        };
        axisXBand: {
            grid: boolean;
        };
    };
    dark: {
        font: string;
        background: string;
        fieldTitle: string;
        title: {
            align: string;
            anchor: string;
            color: string;
            titleFontStyle: string;
            fontWeight: number;
            fontSize: number;
            orient: string;
            offset: number;
        };
        header: {
            titleFontWeight: number;
            titleFontSize: number;
            titleColor: string;
            titleFontStyle: string;
            labelFontSize: number;
            labelFontWeight: number;
            labelColor: string;
            labelFontStyle: string;
        };
        axis: {
            labelFontSize: number;
            labelFontWeight: number;
            labelColor: string;
            labelFontStyle: string;
            titleFontWeight: number;
            titleFontSize: number;
            titleColor: string;
            titleFontStyle: string;
            ticks: boolean;
            gridColor: string;
            domain: boolean;
            domainWidth: number;
            domainColor: string;
            labelFlush: boolean;
            labelFlushOffset: number;
            labelBound: boolean;
            labelLimit: number;
            titlePadding: number;
            labelPadding: number;
            labelSeparation: number;
            labelOverlap: boolean;
        };
        legend: {
            labelFontSize: number;
            labelFontWeight: number;
            labelColor: string;
            titleFontSize: number;
            titleFontWeight: number;
            titleFontStyle: string;
            titleColor: string;
            titlePadding: number;
            labelPadding: number;
            columnPadding: number;
            rowPadding: number;
            padding: number;
            symbolStrokeWidth: number;
        };
        range: {
            category: string[];
            diverging: string[];
            ramp: string[];
            heatmap: string[];
        };
        view: {
            columns: number;
            strokeWidth: number;
            stroke: string;
            continuousHeight: number;
            continuousWidth: number;
        };
        boxplot: {
            ticks: {
                fill: string;
            };
            rule: {
                color: string;
            };
        };
        concat: {
            columns: number;
        };
        facet: {
            columns: number;
        };
        mark: {
            tooltip: boolean;
            color: string;
        };
        bar: {
            binSpacing: number;
            discreteBandSize: {
                band: number;
            };
        };
        axisDiscrete: {
            grid: boolean;
        };
        axisXPoint: {
            grid: boolean;
        };
        axisTemporal: {
            grid: boolean;
        };
        axisXBand: {
            grid: boolean;
        };
    };
};
export declare const AntVTheme: GWGlobalConfig;
export declare const builtInThemes: {
    [themeKey: string]: {
        light: VegaGlobalConfig;
        dark: VegaGlobalConfig;
    };
};
export declare const getPrimaryColor: (defaultColor: string) => GWGlobalConfig<import("vega-typings").Config & import("vega-lite").Config<import("vega-lite/build/src/expr").ExprRef | import("vega-typings").SignalRef> & {
    leafletGeoTileUrl?: string | undefined;
} & {
    scale?: {
        continuous: {
            range: string[];
        };
    } | undefined;
}>;
export declare const getColorPalette: (palette: string) => {
    light: {
        range: {
            category: {
                scheme: string;
            };
            diverging: {
                scheme: string;
            };
            heatmap: {
                scheme: string;
            };
            ordinal: {
                scheme: string;
            };
            ramp: {
                scheme: string;
            };
        };
    };
    dark: {
        range: {
            category: {
                scheme: string;
            };
            diverging: {
                scheme: string;
            };
            heatmap: {
                scheme: string;
            };
            ordinal: {
                scheme: string;
            };
            ramp: {
                scheme: string;
            };
        };
    };
};
