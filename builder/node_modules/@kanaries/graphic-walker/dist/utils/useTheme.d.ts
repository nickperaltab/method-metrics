import { VegaGlobalConfig } from '../interfaces';
export declare function getTheme(props: {
    vizThemeConfig?: any;
    primaryColor?: string;
    colorPalette?: string;
    mediaTheme: 'dark' | 'light';
}): VegaGlobalConfig;
export declare function getColor(theme: VegaGlobalConfig): {
    primaryColor: string;
    nominalPalette: string[];
    quantitativePalette: string[];
};
