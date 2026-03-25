/// <reference types="react" />
export declare const VizAppContext: (props: {
    children?: import("react").ReactNode | Iterable<import("react").ReactNode>;
} & {
    ComputationContext: import("..").IComputationFunction;
    themeContext: "dark" | "light";
    vegaThemeContext: {
        vizThemeConfig?: import("..").IThemeKey | import("../vis/theme").GWGlobalConfig | undefined;
        setVizThemeConfig?: ((cfg: import("..").IThemeKey | import("../vis/theme").GWGlobalConfig) => void) | undefined;
    };
    portalContainerContext: HTMLDivElement | null;
}) => import("react").ReactNode | Iterable<import("react").ReactNode>;
