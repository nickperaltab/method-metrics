const GEOM_TYPES = {
    generic: ['auto', 'bar', 'line', 'area', 'trail', 'point', 'circle', 'tick', 'rect', 'arc', 'text', 'boxplot', 'table'],
    geographic: ['poi', 'choropleth'],
};
const COORD_TYPES = ['generic', 'geographic'];
const STACK_MODE = ['none', 'stack', 'normalize', 'center'];
const CHART_LAYOUT_TYPE = ['auto', 'fixed', 'full'];
const CHANNEL_LIMIT = {
    rows: Infinity,
    columns: Infinity,
    color: 1,
    opacity: 1,
    size: 1,
    shape: 1,
    theta: 1,
    radius: 1,
    details: Infinity,
    text: 1,
};
const META_FIELD_KEYS = ['dimensions', 'measures'];
const POSITION_CHANNEL_CONFIG_LIST = ['x', 'y'];
const NON_POSITION_CHANNEL_CONFIG_LIST = ['color', 'opacity', 'shape', 'size'];
const AGGREGATOR_LIST = ['sum', 'mean', 'median', 'count', 'min', 'max', 'variance', 'stdev'];
const EMBEDED_MENU_LIST = ['data_interpretation', 'data_view'];
const RENDERER_TYPES = ['vega-lite', 'observable-plot'];
export const GLOBAL_CONFIG = {
    AGGREGATOR_LIST,
    CHART_LAYOUT_TYPE,
    COORD_TYPES,
    GEOM_TYPES,
    MAX_HISTORY_SIZE: 20,
    STACK_MODE,
    META_FIELD_KEYS,
    CHANNEL_LIMIT,
    POSITION_CHANNEL_CONFIG_LIST,
    NON_POSITION_CHANNEL_CONFIG_LIST,
    EMBEDED_MENU_LIST,
    RENDERER_TYPES,
    PAINT_MAP_SIZE: 128,
    PAINT_SIZE_FACTOR: 4,
    PAINT_MIN_BRUSH_SIZE: 1,
    PAINT_DEFAULT_BRUSH_SIZE: 9,
    PAINT_MAX_BRUSH_SIZE: 36,
    KEYWORD_DEBOUNCE_SETTING: { timeout: 300, leading: true, trailing: true },
};
export function getGlobalConfig() {
    return GLOBAL_CONFIG;
}
//# sourceMappingURL=config.js.map