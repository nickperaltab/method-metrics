import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import ReactiveRenderer from './renderer/index';
import { ComputationContext, VizStoreWrapper, useCompututaion, useVizStore, withErrorReport, withTimeout } from './store';
import { mergeLocaleRes, setLocaleLanguage } from './locales/i18n';
import { renderSpec } from './store/visualSpecStore';
import { guardDataKeys } from './utils/dataPrep';
import { getComputation } from './computation/clientComputation';
import { ErrorContext } from './utils/reportError';
import { ErrorBoundary } from 'react-error-boundary';
import Errorpanel from './components/errorpanel';
import { useCurrentMediaTheme } from './utils/media';
import { classNames, getFilterMeaAggKey, parseErrorMessage } from './utils';
import { VegaliteMapper } from './lib/vl2gw';
import { newChart } from './models/visSpecHistory';
import { SimpleOneOfSelector, SimpleRange, SimpleSearcher, SimpleTemporalRange } from './fields/filterField/simple';
import { toWorkflow } from './utils/workflow';
import { useResizeDetector } from 'react-resize-detector';
import { VizAppContext } from './store/context';
const XL = 1280;
const MD = 768;
export const RendererApp = observer(function VizApp(props) {
    const { computation, darkMode = 'light', i18nLang = 'en-US', i18nResources, themeKey = 'vega', themeConfig, vizThemeConfig, geographicData, computationTimeout = 60000, spec, vlSpec, chart, onError, } = props;
    const { i18n } = useTranslation();
    const curLang = i18n.language;
    useEffect(() => {
        if (i18nResources) {
            mergeLocaleRes(i18nResources);
        }
    }, [i18nResources]);
    useEffect(() => {
        if (i18nLang !== curLang) {
            setLocaleLanguage(i18nLang);
        }
    }, [i18nLang, curLang]);
    const vizStore = useVizStore();
    const [currentTheme, setCurrentTheme] = useState((vizThemeConfig ?? themeConfig ?? themeKey));
    useEffect(() => {
        if (geographicData) {
            vizStore.setGeographicData(geographicData, geographicData.key);
        }
    }, [vizStore, geographicData]);
    useEffect(() => {
        if (spec) {
            vizStore.replaceNow(renderSpec(spec, vizStore.meta, vizStore.currentVis.name ?? 'Chart 1', vizStore.currentVis.visId));
        }
    }, [spec, vizStore]);
    useEffect(() => {
        if (chart) {
            vizStore.importCode(chart);
        }
    }, [chart, vizStore]);
    useEffect(() => {
        if (vlSpec) {
            const emptyChart = newChart(vizStore.meta, '');
            vizStore.replaceNow(VegaliteMapper(spec, [...emptyChart.encodings.dimensions, ...emptyChart.encodings.measures], vizStore.currentVis.name ?? 'Chart 1', vizStore.currentVis.visId));
        }
    }, [vlSpec, vizStore]);
    const reportError = useCallback((msg, code) => {
        const err = new Error(`Error${code ? `(${code})` : ''}: ${msg}`);
        console.error(err);
        onError?.(err);
        if (code) {
            vizStore.updateShowErrorResolutionPanel(code, msg);
        }
    }, [vizStore, onError]);
    const wrappedComputation = useMemo(() => (computation ? withErrorReport(withTimeout(computation, computationTimeout), (err) => reportError(parseErrorMessage(err), 501)) : async () => []), [reportError, computation, computationTimeout]);
    const [portal, setPortal] = useState(null);
    return (React.createElement(ErrorContext, { value: { reportError } },
        React.createElement(ErrorBoundary, { fallback: React.createElement("div", null, "Something went wrong"), onError: props.onError },
            React.createElement(VizAppContext, { ComputationContext: wrappedComputation, themeContext: darkMode, vegaThemeContext: { vizThemeConfig: currentTheme, setVizThemeConfig: setCurrentTheme }, portalContainerContext: portal },
                React.createElement("div", { className: `${darkMode === 'dark' ? 'dark' : ''} App font-sans bg-background text-foreground m-0 p-0` },
                    React.createElement("div", { className: "flex flex-col space-y-2 bg-background text-foreground" },
                        React.createElement(Errorpanel, null),
                        React.createElement(FilterSection, null),
                        React.createElement("div", { className: props.containerClassName, style: props.containerStyle }, computation && (React.createElement(ReactiveRenderer, { vizThemeConfig: currentTheme, computationFunction: wrappedComputation, 
                            // @TODO remove channelScales
                            scales: props.scales ?? props.channelScales, overrideSize: props.overrideSize })))),
                    React.createElement("div", { ref: setPortal }))))));
});
const FilterItem = observer(function FilterItem({ filter, onChange }) {
    const vizStore = useVizStore();
    const { allFields, viewDimensions, config } = vizStore;
    const { timezoneDisplayOffset } = config;
    const computation = useCompututaion();
    const originalField = filter.enableAgg ? allFields.find((x) => x.fid === filter.fid) : undefined;
    const filterAggName = filter?.enableAgg ? filter.aggName : undefined;
    const transformedComputation = useMemo(() => {
        if (originalField && viewDimensions.length > 0) {
            const preWorkflow = toWorkflow([], allFields, viewDimensions, [{ ...originalField, aggName: filterAggName }], true, 'none', [], undefined, timezoneDisplayOffset).map((x) => {
                if (x.type === 'view') {
                    return {
                        ...x,
                        query: x.query.map((q) => {
                            if (q.op === 'aggregate') {
                                return { ...q, measures: q.measures.map((m) => ({ ...m, asFieldKey: m.field })) };
                            }
                            return q;
                        }),
                    };
                }
                return x;
            });
            return (query) => computation({
                ...query,
                workflow: preWorkflow.concat(query.workflow.filter((x) => x.type !== 'transform')),
            });
        }
        else {
            return computation;
        }
    }, [computation, viewDimensions, originalField, filterAggName]);
    return (React.createElement(ComputationContext.Provider, { value: transformedComputation },
        filter.rule?.type === 'regexp' && (React.createElement(SimpleSearcher, { allFields: allFields, key: getFilterMeaAggKey(filter), field: filter, onChange: onChange, displayOffset: timezoneDisplayOffset })),
        (filter.rule?.type === 'not in' || filter.rule?.type === 'one of') && (React.createElement(SimpleOneOfSelector, { allFields: allFields, key: getFilterMeaAggKey(filter), field: filter, onChange: onChange, displayOffset: timezoneDisplayOffset })),
        filter.rule?.type === 'range' && (React.createElement(SimpleRange, { allFields: allFields, key: getFilterMeaAggKey(filter), field: filter, onChange: onChange, displayOffset: timezoneDisplayOffset })),
        filter.rule?.type === 'temporal range' && (React.createElement(SimpleTemporalRange, { allFields: allFields, key: getFilterMeaAggKey(filter), field: filter, onChange: onChange, displayOffset: timezoneDisplayOffset }))));
});
const FilterSection = observer(function FilterSection() {
    const vizStore = useVizStore();
    const handleWriteFilter = React.useCallback((index, rule) => {
        if (index !== null) {
            vizStore.writeFilter(index, rule ?? null);
        }
    }, [vizStore]);
    const { width = 0, ref } = useResizeDetector();
    const cols = width > XL ? 'grid-cols-3' : width > MD ? 'grid-cols-2' : 'grid-cols-1';
    return (React.createElement("div", { className: classNames('grid gap-2 px-2', cols), ref: ref }, vizStore.viewFilters.map((filter, idx) => (React.createElement(FilterItem, { key: filter.fid, filter: filter, onChange: (rule) => handleWriteFilter(idx, rule) })))));
});
export function RendererAppWithContext(props) {
    const { dark, dataSource, computation, onMetaChange, fieldKeyGuard, keepAlive, storeRef, defaultConfig, defaultRenderer, ...rest } = props;
    // @TODO remove deprecated props
    const appearance = props.appearance ?? props.dark;
    const data = props.data ?? props.dataSource;
    const fields = props.fields ?? props.rawFields ?? [];
    const { computation: safeComputation, safeMetas, onMetaChange: safeOnMetaChange, } = useMemo(() => {
        if (data) {
            if (props.fieldKeyGuard) {
                const { safeData, safeMetas } = guardDataKeys(data, fields);
                return {
                    safeMetas,
                    computation: getComputation(safeData),
                    onMetaChange: (safeFID, meta) => {
                        const index = safeMetas.findIndex((x) => x.fid === safeFID);
                        if (index >= 0) {
                            props.onMetaChange?.(fields[index].fid, meta);
                        }
                    },
                };
            }
            return {
                safeMetas: fields,
                computation: getComputation(data),
                onMetaChange: props.onMetaChange,
            };
        }
        return {
            safeMetas: fields,
            computation: props.computation,
            onMetaChange: props.onMetaChange,
        };
    }, [fields, data ? data : props.computation, props.fieldKeyGuard, props.onMetaChange]);
    const darkMode = useCurrentMediaTheme(appearance);
    return (React.createElement(VizStoreWrapper, { onMetaChange: safeOnMetaChange, meta: safeMetas, keepAlive: keepAlive, storeRef: storeRef, defaultConfig: defaultConfig, defaultRenderer: defaultRenderer },
        React.createElement(RendererApp, { ...rest, darkMode: darkMode, computation: safeComputation })));
}
//# sourceMappingURL=Renderer.js.map