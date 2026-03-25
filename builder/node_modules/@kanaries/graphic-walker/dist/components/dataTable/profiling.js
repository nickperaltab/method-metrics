import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { profileNonmialField, profileQuantitativeField, wrapComputationWithTag } from '../../computation';
import React from 'react';
import { formatDate, isNotEmpty } from '../../utils';
import Tooltip from '../tooltip';
import { themeContext, vegaThemeContext } from '../../store/theme';
import { parsedOffsetDate } from '../../lib/op/offset';
import embed from 'vega-embed';
import { format } from 'd3-format';
import { getTheme } from '../../utils/useTheme';
function NominalProfiling({ computation, field, valueRenderer = (s) => `${s}` }) {
    const [stat, setStat] = useState();
    useEffect(() => {
        profileNonmialField(wrapComputationWithTag(computation, "profiling"), field).then(setStat);
    }, [computation, field]);
    if (!isNotEmpty(stat)) {
        return React.createElement("div", { className: "h-24 flex items-center justify-center" }, "Loading...");
    }
    const render = (value) => {
        const displayValue = valueRenderer(value);
        if (!displayValue) {
            return React.createElement("span", { className: "text-destructive" }, "(Empty)");
        }
        return displayValue;
    };
    const [meta, tops] = stat;
    // shows top 2 when the maximum quantity is more than 1.3x the average quantity, and over 1%.
    // or there are lower than 10 unique values.
    const showsTops = meta.distinctTotal < 10 || (tops[0].count > (1.3 * meta.total) / meta.distinctTotal && tops[0].count > meta.total / 100);
    if (meta.distinctTotal === 1) {
        return React.createElement("div", { className: "h-24 flex items-center justify-center text-xl" },
            "= ",
            render(tops[0].value));
    }
    return (React.createElement("div", { className: "h-24 flex items-center justify-center flex-col gap-2 text-xs" },
        showsTops && (React.createElement(React.Fragment, null,
            tops.map(({ count, value }, idx) => {
                const displayValue = render(value);
                return (React.createElement(Tooltip, { key: idx, content: displayValue },
                    React.createElement("div", { className: "w-full rounded-md px-2 py-1 hover:bg-accent flex justify-between space-x-2" },
                        React.createElement("div", { className: "min-w-[0px] flex-shrink truncate max-w-[180px]" }, displayValue),
                        React.createElement("div", { className: "flex-shrink-0" },
                            Math.floor((100 * count) / meta.total),
                            "%"))));
            }),
            meta.distinctTotal > tops.length && (React.createElement("div", { className: "w-full rounded-md px-2 py-1 text-muted-foreground hover:bg-accent flex justify-between space-x-2" },
                React.createElement("div", { className: "min-w-[0px] flex-shrink whitespace-nowrap text-ellipsis overflow-hidden" },
                    "Other (",
                    meta.distinctTotal - tops.length,
                    ")"),
                React.createElement("div", { className: "flex-shrink-0" },
                    100 - tops.reduce((totalPercent, { count }) => totalPercent + Math.floor((100 * count) / meta.total), 0),
                    "%"))))),
        !showsTops && (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "text-lg" }, meta.distinctTotal),
            React.createElement("div", null, "unique values")))));
}
const formatter = format('~s');
function QuantitativeProfiling({ computation, field }) {
    const [stat, setStat] = useState();
    useEffect(() => {
        profileQuantitativeField(wrapComputationWithTag(computation, "profiling"), field).then(setStat);
    }, [computation, field]);
    if (!isNotEmpty(stat)) {
        return React.createElement("div", { className: "h-24 flex items-center justify-center" }, "Loading...");
    }
    if (stat.min === stat.max) {
        return React.createElement("div", { className: "h-24 flex items-center justify-center text-xl" },
            "= ",
            stat.min);
    }
    return (React.createElement("div", { className: "h-24 w-full flex flex-col space-y-1" },
        React.createElement(BinRenderer, { data: stat }),
        React.createElement("div", { className: "flex justify-between w-full text-xs font-medium leading-none" },
            React.createElement("div", null, formatter(stat.min)),
            React.createElement("div", null, formatter(stat.max)))));
}
function BinRenderer({ data }) {
    const mediaTheme = useContext(themeContext);
    const { vizThemeConfig } = useContext(vegaThemeContext);
    const theme = getTheme({
        mediaTheme,
        vizThemeConfig,
    });
    const vegaConfig = useMemo(() => {
        const config = {
            ...theme,
            background: 'transparent',
        };
        return config;
    }, [theme]);
    const ref = useCallback((node) => {
        if (!node) {
            return;
        }
        const { width } = node.getBoundingClientRect();
        const spec = {
            width: width - 10,
            height: 70,
            autosize: 'fit',
            data: {
                values: data.binValues.map(({ from, to, count }) => ({
                    value: `${formatter(from)} - ${formatter(to)}`,
                    sort: from,
                    count,
                })),
            },
            mark: { type: 'bar', opacity: 0.96, tooltip: { content: 'data' } },
            encoding: {
                x: {
                    field: 'value',
                    type: 'ordinal',
                    sort: { op: 'sum', field: 'sort' },
                    axis: false,
                },
                y: {
                    field: 'count',
                    type: 'quantitative',
                    axis: false,
                },
                tooltip: [
                    { field: 'value', type: 'ordinal', title: 'Value' },
                    { field: 'count', type: 'quantitative', title: 'Count' },
                ],
            },
            config: { view: { stroke: null } },
        };
        embed(node, spec, {
            renderer: 'canvas',
            mode: 'vega-lite',
            actions: false,
            config: vegaConfig,
            tooltip: {
                theme: mediaTheme,
            },
        });
    }, [data, vegaConfig]);
    return React.createElement("div", { ref: ref });
}
function LazyLoaded(Component) {
    return function (props) {
        const [loaded, setLoaded] = useState(false);
        const obRef = useRef();
        const ref = useCallback((node) => {
            obRef.current?.disconnect();
            if (node) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setLoaded(true);
                            observer.disconnect();
                        }
                    });
                });
                observer.observe(node);
                obRef.current = observer;
            }
        }, []);
        return (React.createElement(React.Fragment, null,
            loaded && React.createElement(Component, { ...props }),
            React.createElement("div", { className: "w-0 h-0", ref: ref })));
    };
}
function FieldProfilingElement(props) {
    const { semanticType, displayOffset, offset, ...fieldProps } = props;
    switch (semanticType) {
        case 'nominal':
        case 'ordinal':
            return React.createElement(NominalProfiling, { ...fieldProps });
        case 'temporal': {
            const formatter = (date) => formatDate(parsedOffsetDate(displayOffset, offset)(date));
            return React.createElement(NominalProfiling, { ...fieldProps, valueRenderer: formatter });
        }
        case 'quantitative':
            return React.createElement(QuantitativeProfiling, { ...fieldProps });
    }
}
export const FieldProfiling = LazyLoaded(FieldProfilingElement);
//# sourceMappingURL=profiling.js.map