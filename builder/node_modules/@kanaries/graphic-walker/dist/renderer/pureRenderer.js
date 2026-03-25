import React, { useState, useEffect, forwardRef, useMemo, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { ShadowDom } from '../shadow-dom';
import LeafletRenderer, { LEAFLET_DEFAULT_HEIGHT } from '../components/leafletRenderer';
import { withAppRoot } from '../components/appRoot';
import SpecRenderer from './specRenderer';
import { useRenderer } from './hooks';
import { getComputation } from '../computation/clientComputation';
import { getSort } from '../utils';
import { VizAppContext } from '../store/context';
import { useCurrentMediaTheme } from '../utils/media';
import LoadingLayer from "../components/loadingLayer";
/**
 * Render a readonly chart with given visualization schema.
 * This is a pure component, which means it will not depend on any global state.
 */
const PureRenderer = forwardRef(function PureRenderer(props, ref) {
    const { name, className, themeKey, uiTheme, colorConfig, vizThemeConfig, appearance, dark, visualState, visualConfig, visualLayout: layout, overrideSize, locale, type, themeConfig, channelScales, scales, disableCollapse, } = props;
    const computation = useMemo(() => {
        if (props.type === 'remote') {
            return props.computation;
        }
        return getComputation(props.rawData);
    }, [type, type === 'remote' ? props.computation : props.rawData]);
    const rawLayout = layout ?? visualConfig;
    const visualLayout = useMemo(() => ({
        ...rawLayout,
        ...(overrideSize ? { size: overrideSize } : {}),
    }), [rawLayout, overrideSize]);
    const sizeMode = visualLayout.size.mode;
    const sort = getSort(visualState);
    const limit = visualConfig.limit ?? -1;
    const defaultAggregated = visualConfig?.defaultAggregated ?? false;
    const [viewData, setViewData] = useState([]);
    const { allFields, viewDimensions, viewMeasures, filters } = useMemo(() => {
        const viewDimensions = [];
        const viewMeasures = [];
        const { dimensions, measures, filters, ...state } = visualState;
        const allFields = [...dimensions, ...measures];
        const dKeys = Object.keys(state);
        for (const dKey of dKeys) {
            for (const f of state[dKey]) {
                if (f.analyticType === 'dimension') {
                    viewDimensions.push(f);
                }
                else if (f.analyticType === 'measure') {
                    viewMeasures.push(f);
                }
            }
        }
        return { allFields, viewDimensions, viewMeasures, filters };
    }, [visualState]);
    const { viewData: data, loading: waiting } = useRenderer({
        allFields,
        viewDimensions,
        viewMeasures,
        filters,
        defaultAggregated,
        sort,
        folds: visualConfig.folds,
        limit,
        computationFunction: computation,
        timezoneDisplayOffset: visualConfig['timezoneDisplayOffset'],
    });
    // Dependencies that should not trigger effect individually
    const latestFromRef = useRef({ data });
    latestFromRef.current = { data };
    useEffect(() => {
        if (waiting === false) {
            unstable_batchedUpdates(() => {
                setViewData(latestFromRef.current.data);
            });
        }
    }, [waiting]);
    const { coordSystem = 'generic' } = visualConfig;
    const isSpatial = coordSystem === 'geographic';
    const darkMode = useCurrentMediaTheme(appearance ?? dark);
    const [currentTheme, setCurrentTheme] = useState((vizThemeConfig ?? themeConfig ?? themeKey));
    const [portal, setPortal] = useState(null);
    return (React.createElement(ShadowDom, { style: sizeMode === 'full' ? { width: '100%', height: '100%' } : undefined, className: className, uiTheme: uiTheme ?? colorConfig },
        React.createElement(VizAppContext, { ComputationContext: computation, themeContext: darkMode, vegaThemeContext: { vizThemeConfig: currentTheme, setVizThemeConfig: setCurrentTheme }, portalContainerContext: portal },
            waiting && React.createElement(LoadingLayer, null),
            React.createElement("div", { className: `App relative ${darkMode === 'dark' ? 'dark' : ''}`, style: sizeMode === 'full' ? { width: '100%', height: '100%' } : undefined },
                isSpatial && (React.createElement("div", { className: "max-w-full", style: { height: LEAFLET_DEFAULT_HEIGHT, flexGrow: 1 } },
                    React.createElement(LeafletRenderer, { data: data, draggableFieldState: visualState, visualConfig: visualConfig, visualLayout: visualLayout }))),
                isSpatial || (React.createElement(SpecRenderer, { name: name, data: viewData, ref: ref, draggableFieldState: visualState, visualConfig: visualConfig, layout: visualLayout, locale: locale ?? 'en-US', scales: scales ?? channelScales, vizThemeConfig: currentTheme, disableCollapse: disableCollapse })),
                React.createElement("div", { ref: setPortal })))));
});
export default observer(withAppRoot(PureRenderer));
//# sourceMappingURL=pureRenderer.js.map