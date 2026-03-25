import React, { useEffect, useState, useMemo, useCallback, useContext } from 'react';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useTranslation } from 'react-i18next';
import { useVizStore } from '../../store';
import { GLOBAL_CONFIG } from '../../config';
import Toggle from '../toggle';
import { ColorSchemes, extractRGBA } from './colorScheme';
import { DomainScale, RangeScale } from './range-scale';
import { ConfigItemContainer, ConfigItemContent, ConfigItemHeader, ConfigItemTitle } from './config-item';
import { isNotEmpty } from '../../utils';
import { timezones } from './timezone';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dialog, DialogFooter, DialogNormalContent } from '../ui/dialog';
import Combobox from '../dropdownSelect/combobox';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { vegaThemeContext } from '../../store/theme';
import { ColorPickerComponent } from './color-picker';
function useDomainScale() {
    const [enableMinDomain, setEnableMinDomain] = useState(false);
    const [enableMaxDomain, setEnableMaxDomain] = useState(false);
    const [domainMin, setDomainMin] = useState(0);
    const [domainMax, setDomainMax] = useState(100);
    const [enableType, setEnableType] = useState(false);
    const [type, setType] = useState('linear');
    const setValue = useCallback((value) => {
        setEnableMaxDomain(isNotEmpty(value.domainMax));
        setEnableMinDomain(isNotEmpty(value.domainMin));
        setEnableType(isNotEmpty(value.type));
        setDomainMin(value.domainMin ?? 0);
        setDomainMax(value.domainMax ?? 100);
        setType(value.type ?? 'linear');
    }, []);
    const value = useMemo(() => ({
        ...(enableType ? { type } : {}),
        ...(enableMaxDomain ? { domainMax } : {}),
        ...(enableMinDomain ? { domainMin } : {}),
    }), [enableMaxDomain && domainMax, enableMinDomain && domainMin, enableType && type]);
    return {
        value,
        setValue,
        enableMaxDomain,
        enableMinDomain,
        domainMax,
        domainMin,
        setEnableMinDomain,
        setEnableMaxDomain,
        setDomainMin,
        setDomainMax,
        enableType,
        type,
        setType,
        setEnableType,
    };
}
function useScale(minRange, maxRange, defaultMinRange, defaultMaxRange) {
    const [enableMinDomain, setEnableMinDomain] = useState(false);
    const [enableMaxDomain, setEnableMaxDomain] = useState(false);
    const [enableRange, setEnableRange] = useState(false);
    const [domainMin, setDomainMin] = useState(0);
    const [domainMax, setDomainMax] = useState(100);
    const [rangeMin, setRangeMin] = useState(defaultMinRange ?? minRange);
    const [rangeMax, setRangeMax] = useState(defaultMaxRange ?? maxRange);
    const [enableType, setEnableType] = useState(false);
    const [type, setType] = useState('linear');
    const setValue = useCallback((value) => {
        setEnableMaxDomain(isNotEmpty(value.domainMax));
        setEnableMinDomain(isNotEmpty(value.domainMin));
        setEnableRange(isNotEmpty(value.rangeMax) || isNotEmpty(value.rangeMin));
        setEnableType(isNotEmpty(value.type));
        setDomainMin(value.domainMin ?? 0);
        setDomainMax(value.domainMax ?? 100);
        setRangeMax(value.rangeMax ?? defaultMaxRange ?? maxRange);
        setRangeMin(value.rangeMin ?? defaultMinRange ?? minRange);
        setType(value.type ?? 'linear');
    }, [defaultMaxRange, defaultMinRange, maxRange, minRange]);
    const value = useMemo(() => ({
        ...(enableType ? { type } : {}),
        ...(enableMaxDomain ? { domainMax } : {}),
        ...(enableMinDomain ? { domainMin } : {}),
        ...(enableRange ? { rangeMax, rangeMin } : {}),
    }), [enableMaxDomain && domainMax, enableMinDomain && domainMin, enableRange && rangeMax, enableRange && rangeMin, enableType && type]);
    return {
        type,
        setType,
        enableType,
        setEnableType,
        value,
        setValue,
        enableMaxDomain,
        enableMinDomain,
        enableRange,
        rangeMax,
        rangeMin,
        domainMax,
        domainMin,
        setEnableMinDomain,
        setEnableMaxDomain,
        setEnableRange,
        setDomainMin,
        setDomainMax,
        setRangeMin,
        setRangeMax,
    };
}
const VisualConfigPanel = () => {
    const vizStore = useVizStore();
    const { layout, showVisualConfigPanel, config } = vizStore;
    const { t } = useTranslation();
    const formatConfigList = ['numberFormat', 'timeFormat', 'normalizedNumberFormat'];
    const [format, setFormat] = useState({
        numberFormat: layout.format.numberFormat,
        timeFormat: layout.format.timeFormat,
        normalizedNumberFormat: layout.format.normalizedNumberFormat,
    });
    const [resolve, setResolve] = useState({
        x: layout.resolve.x,
        y: layout.resolve.y,
        color: layout.resolve.color,
        opacity: layout.resolve.opacity,
        shape: layout.resolve.shape,
        size: layout.resolve.size,
    });
    const [zeroScale, setZeroScale] = useState(layout.zeroScale);
    const [svg, setSvg] = useState(layout.useSvg ?? false);
    const [scaleIncludeUnmatchedChoropleth, setScaleIncludeUnmatchedChoropleth] = useState(layout.scaleIncludeUnmatchedChoropleth ?? false);
    const [showAllGeoshapeInChoropleth, setShowAllGeoshapeInChoropleth] = useState(layout.showAllGeoshapeInChoropleth ?? false);
    const [renderer, setRenderer] = useState(layout.renderer ?? 'vega-lite');
    const [background, setBackground] = useState({ r: 255, g: 255, b: 255, a: 0 });
    const [defaultColor, setDefaultColor] = useState({ r: 91, g: 143, b: 249, a: 1 });
    const [primaryColorEdited, setPrimaryColorEdited] = useState(false);
    const [backgroundEdited, setBackgroundEdited] = useState(false);
    const [displayColorPicker, setDisplayColorPicker] = useState(false);
    const [displayBackgroundPicker, setDisplayBackgroundPicker] = useState(false);
    const [colorPalette, setColorPalette] = useState('');
    const { vizThemeConfig, setVizThemeConfig } = useContext(vegaThemeContext);
    const [themeKey, setThemeKey] = useState(typeof vizThemeConfig === 'string' ? vizThemeConfig : 'vega');
    const [geoMapTileUrl, setGeoMapTileUrl] = useState(undefined);
    const [displayOffset, setDisplayOffset] = useState(undefined);
    const [displayOffsetEdited, setDisplayOffsetEdited] = useState(false);
    const [enabledScales, setEnabledScales] = useState([]);
    const columnValue = useDomainScale();
    const rowValue = useDomainScale();
    const colorValue = useDomainScale();
    const thetaValue = useDomainScale();
    const radiusValue = useDomainScale();
    const opacityValue = useScale(0, 1, 0.3, 0.8);
    const sizeValue = useScale(0, 100);
    const scalesSet = new Set(enabledScales);
    useEffect(() => {
        setZeroScale(layout.zeroScale);
        setSvg(layout.useSvg ?? false);
        setRenderer(layout.renderer ?? 'vega-lite');
        setBackground(extractRGBA({
            r: 255,
            g: 255,
            b: 255,
            a: 0,
        }, layout.background));
        setResolve(layout.resolve);
        setDefaultColor(extractRGBA({ r: 91, g: 143, b: 249, a: 1 }, layout.primaryColor));
        setPrimaryColorEdited(false);
        setBackgroundEdited(false);
        setScaleIncludeUnmatchedChoropleth(layout.scaleIncludeUnmatchedChoropleth ?? false);
        setFormat({
            numberFormat: layout.format.numberFormat,
            timeFormat: layout.format.timeFormat,
            normalizedNumberFormat: layout.format.normalizedNumberFormat,
        });
        setColorPalette(layout.colorPalette ?? '');
        setThemeKey(typeof vizThemeConfig === 'string' ? vizThemeConfig : 'vega');
        const enabledScales = Object.entries(layout.scale ?? {})
            .filter(([_k, scale]) => Object.entries(scale).filter(([_k, v]) => !!v).length > 0)
            .map(([k]) => k);
        setEnabledScales(enabledScales.length === 0 ? ['opacity', 'size'] : enabledScales);
        columnValue.setValue(layout.scale?.column ?? {});
        rowValue.setValue(layout.scale?.row ?? {});
        colorValue.setValue(layout.scale?.color ?? {});
        thetaValue.setValue(layout.scale?.theta ?? {});
        radiusValue.setValue(layout.scale?.radius ?? {});
        opacityValue.setValue(layout.scale?.opacity ?? {});
        sizeValue.setValue(layout.scale?.size ?? {});
        setGeoMapTileUrl(layout.geoMapTileUrl);
        setDisplayOffset(config.timezoneDisplayOffset);
        setDisplayOffsetEdited(false);
    }, [showVisualConfigPanel, vizThemeConfig]);
    return (React.createElement(Dialog, { open: showVisualConfigPanel, onOpenChange: () => {
            vizStore.setShowVisualConfigPanel(false);
        } },
        React.createElement(DialogNormalContent, { className: "p-0", onClick: () => {
                setDisplayColorPicker(false);
                setDisplayBackgroundPicker(false);
            } },
            React.createElement("div", { className: "flex flex-col max-h-[calc(min(800px,90vh))] py-6" },
                React.createElement("div", { className: "overflow-y-auto flex-shrink-1 min-h-0 px-6" },
                    React.createElement(ConfigItemContainer, null,
                        React.createElement(ConfigItemHeader, null,
                            React.createElement(ConfigItemTitle, null, "Colors")),
                        React.createElement(ConfigItemContent, null,
                            React.createElement("div", { className: "flex gap-6 flex-col md:flex-row" },
                                React.createElement("div", null,
                                    React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.primary_color')),
                                    React.createElement(ColorPickerComponent, { defaultColor: defaultColor, setDefaultColor: setDefaultColor, setPrimaryColorEdited: setPrimaryColorEdited, displayColorPicker: displayColorPicker, setDisplayColorPicker: setDisplayColorPicker })),
                                React.createElement("div", null,
                                    React.createElement("label", { className: "block text-xs font-medium leading-6" },
                                        t('config.background'),
                                        " ",
                                        t(`config.color`)),
                                    React.createElement(ColorPickerComponent, { defaultColor: background, setDefaultColor: setBackground, setPrimaryColorEdited: setBackgroundEdited, displayColorPicker: displayBackgroundPicker, setDisplayColorPicker: setDisplayBackgroundPicker })),
                                React.createElement("div", null,
                                    React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.theme')),
                                    React.createElement(Combobox, { className: "w-48 h-fit", popClassName: "w-48", selectedKey: themeKey, onSelect: (v) => setThemeKey(v), options: [
                                            { value: 'vega', label: 'vega' },
                                            { value: 'g2', label: 'g2' },
                                            { value: 'streamlit', label: 'streamlit' },
                                        ] })),
                                React.createElement("div", null,
                                    React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.color_palette')),
                                    React.createElement(Combobox, { className: "w-48 h-fit", popClassName: "w-48", selectedKey: colorPalette, onSelect: setColorPalette, placeholder: t('config.default_color_palette'), options: ColorSchemes.map((scheme) => ({
                                            value: scheme.name,
                                            label: (React.createElement(React.Fragment, null,
                                                React.createElement("div", { key: scheme.name, className: "flex flex-col justify-start items-center w-32" },
                                                    React.createElement("div", { className: "font-light" }, scheme.name),
                                                    React.createElement("div", { className: "flex w-full" }, scheme.value.map((c, index) => {
                                                        return React.createElement("div", { key: index, className: "h-4 flex-1", style: { backgroundColor: `${c}` } });
                                                    }))))),
                                        })).concat({
                                            value: '_none',
                                            label: React.createElement(React.Fragment, null, t('config.default_color_palette')),
                                        }) }))))),
                    React.createElement(ConfigItemContainer, null,
                        React.createElement(ConfigItemHeader, null,
                            React.createElement("div", { className: "flex justify-between items-center" },
                                React.createElement(ConfigItemTitle, null, "Scale"),
                                React.createElement(DropdownMenu, null,
                                    React.createElement(DropdownMenuTrigger, { asChild: true },
                                        React.createElement(Button, { variant: "outline" }, "Select Scale")),
                                    React.createElement(DropdownMenuContent, null, ['row', 'column', 'color', 'theta', 'radius', 'opacity', 'size'].map((scale) => (React.createElement(DropdownMenuCheckboxItem, { key: scale, checked: scalesSet.has(scale), onCheckedChange: (e) => {
                                            if (e) {
                                                setEnabledScales((s) => [...s, scale]);
                                            }
                                            else {
                                                setEnabledScales((s) => s.filter((x) => x !== scale));
                                            }
                                        } }, t(`config.${scale}`)))))))),
                        React.createElement(ConfigItemContent, null,
                            scalesSet.has('column') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.column')),
                                React.createElement(DomainScale, { ...columnValue, text: "column" }))),
                            scalesSet.has('row') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.row')),
                                React.createElement(DomainScale, { ...rowValue, text: "row" }))),
                            scalesSet.has('color') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.color')),
                                React.createElement(DomainScale, { ...colorValue, text: "color" }))),
                            scalesSet.has('theta') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.theta')),
                                React.createElement(DomainScale, { ...thetaValue, text: "theta" }))),
                            scalesSet.has('radius') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.radius')),
                                React.createElement(DomainScale, { ...radiusValue, text: "radius" }))),
                            scalesSet.has('opacity') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.opacity')),
                                React.createElement(RangeScale, { ...opacityValue, text: "opacity", maxRange: 1, minRange: 0 }))),
                            scalesSet.has('size') && (React.createElement("div", null,
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('config.size')),
                                React.createElement(RangeScale, { ...sizeValue, text: "size", maxRange: 100, minRange: 0 }))))),
                    React.createElement(ConfigItemContainer, null,
                        React.createElement(ConfigItemHeader, null,
                            React.createElement(ConfigItemTitle, null, t('config.format')),
                            React.createElement("p", { className: "text-xs" },
                                t(`config.formatGuidesDocs`),
                                ":",
                                ' ',
                                React.createElement("a", { target: "_blank", className: "hover:underline text-primary", href: "https://github.com/d3/d3-format#locale_format" }, t(`config.readHere`)))),
                        React.createElement(ConfigItemContent, null,
                            React.createElement("div", { className: "flex gap-4" }, formatConfigList.map((fc) => (React.createElement("div", { className: "my-2", key: fc },
                                React.createElement("label", { className: "block text-xs font-medium leading-6" }, t(`config.${fc}`)),
                                React.createElement("div", { className: "mt-1" },
                                    React.createElement(Input, { type: "text", value: format[fc] ?? '', onChange: (e) => {
                                            setFormat((f) => ({
                                                ...f,
                                                [fc]: e.target.value,
                                            }));
                                        } })))))))),
                    React.createElement(ConfigItemContainer, null,
                        React.createElement(ConfigItemHeader, null,
                            React.createElement(ConfigItemTitle, null, t('config.independence'))),
                        React.createElement(ConfigItemContent, null,
                            React.createElement("div", { className: "flex gap-x-6 gap-y-2 flex-wrap" },
                                GLOBAL_CONFIG.POSITION_CHANNEL_CONFIG_LIST.map((pc) => (React.createElement(Toggle, { label: t(`config.${pc}`), key: pc, enabled: resolve[pc] ?? false, onChange: (e) => {
                                        setResolve((r) => ({
                                            ...r,
                                            [pc]: e,
                                        }));
                                    } }))),
                                GLOBAL_CONFIG.NON_POSITION_CHANNEL_CONFIG_LIST.map((npc) => (React.createElement(Toggle, { label: t(`constant.draggable_key.${npc}`), key: npc, enabled: resolve[npc] ?? false, onChange: (e) => {
                                        setResolve((r) => ({
                                            ...r,
                                            [npc]: e,
                                        }));
                                    } })))))),
                    React.createElement(ConfigItemContainer, null,
                        React.createElement(ConfigItemHeader, null,
                            React.createElement(ConfigItemTitle, null, t('config.misc'))),
                        React.createElement(ConfigItemContent, null,
                            React.createElement("div", { className: "flex flex-col space-y-6" },
                                React.createElement("div", { className: "space-y-2 border-b pb-4" },
                                    React.createElement("h3", { className: "text-sm font-medium" }, t('config.map_settings')),
                                    React.createElement("p", { className: "text-xs text-gray-500 mb-4" }, t('config.map_settings_desc')),
                                    React.createElement("div", { className: "border rounded-md p-4" },
                                        React.createElement("div", { className: "flex justify-between items-center" },
                                            React.createElement("div", null,
                                                React.createElement("label", { className: "text-xs font-medium leading-6" }, t(`config.customTile`)),
                                                React.createElement("p", { className: "text-xs text-gray-500" }, t('config.customTile_desc'))),
                                            React.createElement(Toggle, { enabled: isNotEmpty(geoMapTileUrl), onChange: (e) => {
                                                    setGeoMapTileUrl(e ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' : undefined);
                                                } })),
                                        isNotEmpty(geoMapTileUrl) && (React.createElement(Input, { type: "text", value: geoMapTileUrl, onChange: (e) => {
                                                setGeoMapTileUrl(e.target.value);
                                            }, className: "mt-4 max-w-md", placeholder: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" })))),
                                React.createElement("div", { className: "space-y-2 border-b pb-4" },
                                    React.createElement("h3", { className: "text-sm font-medium" }, t('config.choropleth_settings')),
                                    React.createElement("p", { className: "text-xs text-gray-500 mb-4" }, t('config.choropleth_settings_desc')),
                                    React.createElement("div", { className: "border rounded-md" },
                                        React.createElement("div", { className: "p-4" },
                                            React.createElement("div", { className: "flex justify-between items-center" },
                                                React.createElement("div", null,
                                                    React.createElement("label", { className: "text-xs font-medium leading-6" }, t('config.include_unmatched')),
                                                    React.createElement("p", { className: "text-xs text-gray-500" }, t('config.include_unmatched_desc'))),
                                                React.createElement(Toggle, { enabled: scaleIncludeUnmatchedChoropleth, onChange: (en) => {
                                                        setScaleIncludeUnmatchedChoropleth(en);
                                                    } }))),
                                        React.createElement("hr", null),
                                        React.createElement("div", { className: "p-4" },
                                            React.createElement("div", { className: "flex justify-between items-center" },
                                                React.createElement("div", null,
                                                    React.createElement("label", { className: "text-xs font-medium leading-6" }, t('config.include_shapes')),
                                                    React.createElement("p", { className: "text-xs text-gray-500" }, t('config.include_shapes_desc'))),
                                                React.createElement(Toggle, { enabled: showAllGeoshapeInChoropleth, onChange: (en) => {
                                                        setShowAllGeoshapeInChoropleth(en);
                                                    } }))))),
                                React.createElement("div", { className: "space-y-2 border-b pb-4" },
                                    React.createElement("h3", { className: "text-sm font-medium" }, t('config.visualization_settings')),
                                    React.createElement("p", { className: "text-xs text-gray-500 mb-4" }, t('config.visualization_settings_desc')),
                                    React.createElement("div", { className: "border rounded-md" },
                                        React.createElement("div", { className: 'p-4' },
                                            React.createElement("div", { className: "flex justify-between items-center" },
                                                React.createElement("div", null,
                                                    React.createElement("label", { className: "text-xs font-medium leading-6" }, t(`config.zeroScale`)),
                                                    React.createElement("p", { className: "text-xs text-gray-500" }, t('config.zeroScale_desc'))),
                                                React.createElement(Toggle, { enabled: zeroScale, onChange: (en) => {
                                                        setZeroScale(en);
                                                    } }))),
                                        React.createElement("hr", null),
                                        React.createElement("div", { className: 'p-4' },
                                            React.createElement("div", { className: "flex justify-between items-center" },
                                                React.createElement("div", null,
                                                    React.createElement("label", { className: "text-xs font-medium leading-6" }, t(`config.svg`)),
                                                    React.createElement("p", { className: "text-xs text-gray-500" }, t('config.svg_desc'))),
                                                React.createElement(Toggle, { enabled: svg, onChange: (en) => {
                                                        setSvg(en);
                                                    } }))),
                                        React.createElement("hr", null),
                                        React.createElement("div", { className: 'p-4' },
                                            React.createElement("div", { className: "flex justify-between items-center" },
                                                React.createElement("div", null,
                                                    React.createElement("label", { className: "text-xs font-medium leading-6" }, "Renderer"),
                                                    React.createElement("p", { className: "text-xs text-gray-500" }, "Choose between VegaLite and Observable Plot renderers")),
                                                React.createElement(Combobox, { className: "w-40 h-fit", popClassName: "w-40", selectedKey: renderer, onSelect: (value) => setRenderer(value), options: GLOBAL_CONFIG.RENDERER_TYPES.map((type) => ({
                                                        value: type,
                                                        label: type === 'vega-lite' ? 'VegaLite' : 'Observable Plot',
                                                    })) }))))),
                                React.createElement("div", { className: "space-y-2" },
                                    React.createElement("h3", { className: "text-sm font-medium" }, t('config.timezone_settings')),
                                    React.createElement("p", { className: "text-xs text-gray-500 mb-4" }, t('config.timezone_settings_desc')),
                                    React.createElement("div", { className: "border rounded-md p-4" },
                                        React.createElement("div", { className: "flex justify-between items-center" },
                                            React.createElement("div", null,
                                                React.createElement("label", { className: "text-xs font-medium leading-6" }, t(`config.customOffset`)),
                                                React.createElement("p", { className: "text-xs text-gray-500" }, t('config.customOffset_desc'))),
                                            React.createElement(Toggle, { enabled: isNotEmpty(displayOffset), onChange: (e) => {
                                                    setDisplayOffsetEdited(true);
                                                    setDisplayOffset(e ? new Date().getTimezoneOffset() : undefined);
                                                } })),
                                        isNotEmpty(displayOffset) && (React.createElement(Combobox, { className: "mt-4 max-w-md", popClassName: "w-[400px]", selectedKey: `${displayOffset}`, onSelect: (e) => {
                                                setDisplayOffsetEdited(true);
                                                setDisplayOffset(parseInt(e));
                                            }, options: timezones.map((tz) => ({
                                                value: `${tz.value}`,
                                                label: React.createElement("span", { title: tz.name }, tz.name),
                                            })) })))))))),
                React.createElement(DialogFooter, { className: "gap-2 mt-4 px-6" },
                    React.createElement(Button, { variant: "outline", onClick: () => {
                            vizStore.setShowVisualConfigPanel(false);
                        } }, t('actions.cancel')),
                    React.createElement(Button, { onClick: () => {
                            runInAction(() => {
                                vizStore.setVisualLayout(['format', format], ['zeroScale', zeroScale], ['scaleIncludeUnmatchedChoropleth', scaleIncludeUnmatchedChoropleth], ['showAllGeoshapeInChoropleth', showAllGeoshapeInChoropleth], ['resolve', resolve], ['colorPalette', colorPalette], ['useSvg', svg], ['renderer', renderer], [
                                    'scale',
                                    {
                                        opacity: opacityValue.value,
                                        size: sizeValue.value,
                                        column: columnValue.value,
                                        row: rowValue.value,
                                        color: colorValue.value,
                                        theta: thetaValue.value,
                                        radius: radiusValue.value,
                                    },
                                ], ...(backgroundEdited
                                    ? [
                                        [
                                            'background',
                                            `rgba(${background.r},${background.g},${background.b},${background.a})`,
                                        ],
                                    ]
                                    : []), ...(primaryColorEdited
                                    ? [
                                        [
                                            'primaryColor',
                                            `rgba(${defaultColor.r},${defaultColor.g},${defaultColor.b},${defaultColor.a})`,
                                        ],
                                    ]
                                    : []), ['geoMapTileUrl', geoMapTileUrl]);
                                displayOffsetEdited && vizStore.setVisualConfig('timezoneDisplayOffset', displayOffset);
                                setVizThemeConfig?.(themeKey);
                                vizStore.setShowVisualConfigPanel(false);
                            });
                        } }, t('actions.confirm')))))));
};
export default observer(VisualConfigPanel);
//# sourceMappingURL=index.js.map