import { DEFAULT_COLOR, builtInThemes, getColorPalette, getPrimaryColor } from '../vis/theme';
import { getPalette } from '../components/visualConfig/colorScheme';
const isPlainObject = (obj) => {
    return obj && typeof obj === 'object' && obj.constructor === Object;
};
const clone = (a) => {
    if (Array.isArray(a)) {
        return a.map(clone);
    }
    else if (isPlainObject(a)) {
        return { ...a };
    }
    return a;
};
const deepMerge = (a, b) => {
    if (isPlainObject(a) && isPlainObject(b)) {
        const result = { ...a };
        Object.keys(b).forEach((key) => {
            result[key] = isPlainObject(result[key]) ? deepMerge(result[key], b[key]) : b[key];
        });
        return result;
    }
    return b;
};
const deepMergeAll = (...objects) => {
    return objects.reduce((acc, obj) => deepMerge(acc, obj), {});
};
export function getTheme(props) {
    const { vizThemeConfig, mediaTheme, colorPalette, primaryColor } = props;
    const presetConfig = (typeof vizThemeConfig === 'string' ? builtInThemes[vizThemeConfig] : vizThemeConfig) ?? builtInThemes.vega;
    const colorConfig = primaryColor ? getPrimaryColor(primaryColor) : {};
    const paletteConfig = colorPalette ? getColorPalette(colorPalette) : {};
    const config = deepMergeAll(presetConfig, colorConfig, paletteConfig)?.[mediaTheme];
    return config;
}
function parsePalette(v) {
    if (!v) {
        return undefined;
    }
    if (v instanceof Array) {
        return v;
    }
    if (typeof v === 'object' && 'scheme' in v) {
        if (v.scheme instanceof Array) {
            return v.scheme;
        }
        return getPalette(v.scheme);
    }
    return undefined;
}
export function getColor(theme) {
    const stroke = theme.point?.stroke ?? DEFAULT_COLOR;
    const primaryColor = typeof stroke === 'string' ? stroke : DEFAULT_COLOR;
    const nominalPalette = parsePalette(theme.range?.category) ?? getPalette('tableau10');
    const quantitativePalette = parsePalette(theme.range?.ramp) ?? getPalette('blues');
    return {
        primaryColor,
        nominalPalette,
        quantitativePalette,
    };
}
//# sourceMappingURL=useTheme.js.map