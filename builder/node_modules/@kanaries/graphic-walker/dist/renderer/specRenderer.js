import { Resizable } from 're-resizable';
import React, { forwardRef, useMemo, useContext } from 'react';
import PivotTable from '../components/pivotTable';
import LeafletRenderer, { LEAFLET_DEFAULT_HEIGHT, LEAFLET_DEFAULT_WIDTH } from '../components/leafletRenderer';
import ReactVega from '../vis/react-vega';
import { getTheme } from '../utils/useTheme';
import { uiThemeContext, themeContext } from "../store/theme";
import { parseColorToHex } from "../utils/colors";
import ObservablePlotRenderer from "../vis/observable-plot-renderer";
/**
 * Sans-store renderer of GraphicWalker.
 * This is a pure component, which means it will not depend on any global state.
 */
const SpecRenderer = forwardRef(function ({ name, layout, data, draggableFieldState, visualConfig, onGeomClick, onChartResize, locale, onReportSpec, vizThemeConfig, scales, disableCollapse }, ref) {
    // const { draggableFieldState, visualConfig } = vizStore;
    const { geoms, defaultAggregated, coordSystem, timezoneDisplayOffset } = visualConfig;
    const { interactiveScale, stack, showActions, size, format: _format, background, zeroScale, resolve, useSvg, primaryColor, colorPalette, scale, } = layout;
    const rows = draggableFieldState.rows;
    const columns = draggableFieldState.columns;
    const color = draggableFieldState.color;
    const opacity = draggableFieldState.opacity;
    const shape = draggableFieldState.shape;
    const theta = draggableFieldState.theta;
    const radius = draggableFieldState.radius;
    const sizeChannel = draggableFieldState.size;
    const details = draggableFieldState.details;
    const text = draggableFieldState.text;
    const format = _format;
    const isPivotTable = geoms[0] === 'table';
    const enableResize = size.mode === 'fixed' && Boolean(onChartResize);
    const mediaTheme = useContext(themeContext);
    const uiTheme = useContext(uiThemeContext);
    const themeConfig = getTheme({
        vizThemeConfig,
        mediaTheme,
        primaryColor,
        colorPalette,
    });
    const vegaConfig = useMemo(() => {
        const config = {
            ...themeConfig,
            background: parseColorToHex(uiTheme[mediaTheme].background),
            customFormatTypes: true,
        };
        if (format.normalizedNumberFormat && format.normalizedNumberFormat.length > 0) {
            // @ts-ignore
            config.normalizedNumberFormat = format.normalizedNumberFormat;
        }
        if (format.numberFormat && format.numberFormat.length > 0) {
            // @ts-ignore
            config.numberFormat = format.numberFormat;
        }
        if (format.timeFormat && format.timeFormat.length > 0) {
            // @ts-ignore
            config.timeFormat = format.timeFormat;
        }
        // @ts-ignore
        if (!config.scale) {
            // @ts-ignore
            config.scale = {};
        }
        // @ts-ignore
        config.scale.zero = Boolean(zeroScale);
        // @ts-ignore
        config.resolve = resolve;
        if (background) {
            config.background = background;
        }
        return config;
    }, [themeConfig, mediaTheme, zeroScale, resolve, background, format.normalizedNumberFormat, format.numberFormat, format.timeFormat]);
    if (isPivotTable) {
        return (React.createElement(PivotTable, { data: data, draggableFieldState: draggableFieldState, visualConfig: visualConfig, layout: layout, vizThemeConfig: vizThemeConfig, disableCollapse: disableCollapse }));
    }
    const isSpatial = coordSystem === 'geographic';
    return (React.createElement(Resizable, { className: enableResize ? 'border-primary border-2 max-h-screen max-w-[100vw]' : 'max-h-screen max-w-[100vw]', style: { padding: '12px' }, onResizeStop: (e, direction, ref, d) => {
            onChartResize?.(size.width + d.width, size.height + d.height);
        }, enable: enableResize
            ? undefined
            : {
                top: false,
                right: false,
                bottom: false,
                left: false,
                topRight: false,
                bottomRight: false,
                bottomLeft: false,
                topLeft: false,
            }, size: 
        // ensure PureRenderer with Auto size is correct
        size.mode === 'fixed'
            ? {
                width: size.width + 'px',
                height: size.height + 'px',
            }
            : size.mode === 'full'
                ? {
                    width: '100%',
                    height: '100%',
                }
                : isSpatial
                    ? {
                        width: LEAFLET_DEFAULT_WIDTH + 'px',
                        height: LEAFLET_DEFAULT_HEIGHT + 'px',
                    }
                    : { width: 'auto', height: 'auto' } },
        isSpatial && (React.createElement(LeafletRenderer, { name: name, data: data, draggableFieldState: draggableFieldState, visualConfig: visualConfig, visualLayout: layout, vegaConfig: vegaConfig, scales: scales, scale: scale })),
        !isSpatial && (!layout.renderer || layout.renderer === 'vega-lite') && (React.createElement(ReactVega, { name: name, vegaConfig: vegaConfig, 
            // format={format}
            layoutMode: size.mode, interactiveScale: interactiveScale, geomType: geoms[0], defaultAggregate: defaultAggregated, stack: stack, dataSource: data, rows: rows, columns: columns, color: color[0], theta: theta[0], radius: radius[0], shape: shape[0], opacity: opacity[0], size: sizeChannel[0], details: details, text: text[0], showActions: showActions, width: size.width - 12 * 4, height: size.height - 12 * 4, ref: ref, onGeomClick: onGeomClick, locale: locale, useSvg: useSvg, scales: scales, scale: scale, onReportSpec: onReportSpec, displayOffset: timezoneDisplayOffset })),
        !isSpatial && layout.renderer === 'observable-plot' && (React.createElement(ObservablePlotRenderer, { name: name, vegaConfig: vegaConfig, 
            // format={format
            layoutMode: size.mode, interactiveScale: interactiveScale, geomType: geoms[0], defaultAggregate: defaultAggregated, stack: stack, dataSource: data, rows: rows, columns: columns, color: color[0], theta: theta[0], radius: radius[0], shape: shape[0], opacity: opacity[0], size: sizeChannel[0], details: details, text: text[0], showActions: showActions, width: size.width - 12 * 4, height: size.height - 12 * 4, ref: ref, onGeomClick: onGeomClick, locale: locale, useSvg: useSvg, scales: scales, scale: scale, onReportSpec: onReportSpec, displayOffset: timezoneDisplayOffset }))));
});
export default SpecRenderer;
//# sourceMappingURL=specRenderer.js.map