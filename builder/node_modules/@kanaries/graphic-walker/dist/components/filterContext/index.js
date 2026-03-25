import { getFieldDistinctCounts, getRange, getTemporalRange } from "../../computation";
import { getComputation } from "../../computation/clientComputation";
import { SimpleOneOfSelector, SimpleRange, SimpleTemporalRange } from "../../fields/filterField/simple";
import PureRenderer from "../../renderer/pureRenderer";
import { ShadowDom } from "../../shadow-dom";
import { ComputationContext } from "../../store";
import { addFilterForQuery } from "../../utils/workflow";
import React, { useCallback, useMemo } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
const FilterComputationContext = createContext(null);
export function useNominalFilter(fid, initValue) {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use filter outside of ComputationProvider');
    }
    const { computation, upsertFilter, removeFilter } = context;
    const [value, setValue] = useState(initValue ?? []);
    const [domain, setDomain] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        (async () => {
            setLoading(true);
            const domain = await getFieldDistinctCounts(computation, fid, { sortBy: 'count_dsc' });
            setDomain(domain.map((x) => x.value));
            setLoading(false);
        })();
    }, [computation, fid]);
    useEffect(() => {
        if (value.length) {
            upsertFilter(fid, { type: 'one of', value });
            return () => removeFilter(fid);
        }
        return () => { };
    }, [value]);
    return {
        domain,
        loading,
        value,
        setValue,
    };
}
const isEmptyRange = (a) => a[0] === 0 && a[1] === 0;
export const useTemporalFilter = (fid, initValue, offset) => {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use filter outside of ComputationProvider');
    }
    const { computation, upsertFilter, removeFilter } = context;
    const [value, setValue] = useState(initValue ?? [0, 0]);
    const [domain, setDomain] = useState([0, 0]);
    const [format, setFormat] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        (async () => {
            setLoading(true);
            const [min, max, format] = await getTemporalRange(computation, fid);
            const newDomain = [min, max];
            setDomain(newDomain);
            setFormat(format);
            setLoading(false);
            if (isEmptyRange(value))
                setValue(newDomain);
        })();
    }, [computation, fid]);
    useEffect(() => {
        if (value.length) {
            upsertFilter(fid, { type: 'temporal range', value, format, offset });
            return () => removeFilter(fid);
        }
        return () => { };
    }, [value, format, offset]);
    return {
        domain,
        loading,
        value,
        setValue,
    };
};
export const useQuantitativeFilter = (fid, initValue) => {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use filter outside of ComputationProvider');
    }
    const { computation, upsertFilter, removeFilter } = context;
    const [value, setValue] = useState(initValue ?? [0, 0]);
    const [domain, setDomain] = useState([0, 0]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        (async () => {
            setLoading(true);
            const domain = await getRange(computation, fid);
            setDomain(domain);
            if (isEmptyRange(value))
                setValue(domain);
            setLoading(false);
        })();
    }, [computation, fid]);
    useEffect(() => {
        if (value.length) {
            upsertFilter(fid, { type: 'range', value });
            return () => removeFilter(fid);
        }
        return () => { };
    }, [value]);
    return {
        domain,
        loading,
        value,
        setValue,
    };
};
export function Chart({ chart, ...props }) {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use chart outside of ComputationProvider');
    }
    const { dataComputation } = context;
    return (React.createElement(PureRenderer, { type: "remote", computation: dataComputation, visualConfig: chart.config, visualLayout: chart.layout, visualState: chart.encodings, ...props }));
}
function ComputationProvider({ data, computation, children, }) {
    const computationFunction = useMemo(() => {
        if (data) {
            return getComputation(data);
        }
        return computation;
    }, [data ? data : computation]);
    const [filterMap, setFilterMap] = useState({});
    const filteredComputation = React.useMemo(() => {
        const filters = Object.entries(filterMap).map(([fid, rule]) => ({ fid, rule }));
        return (query) => computationFunction(addFilterForQuery(query, filters));
    }, [filterMap, computationFunction]);
    const upsertFilter = useCallback((fid, rule) => {
        setFilterMap((prev) => ({ ...prev, [fid]: rule }));
    }, []);
    const removeFilter = useCallback((fid) => {
        setFilterMap((prev) => {
            const { [fid]: _, ...rest } = prev;
            return rest;
        });
    }, []);
    return (React.createElement(FilterComputationContext.Provider, { value: { computation: computationFunction, dataComputation: filteredComputation, upsertFilter, removeFilter } }, children));
}
export { ComputationProvider };
const emptyField = [];
export function SelectFilter(props) {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use filter outside of ComputationProvider');
    }
    const { computation, upsertFilter, removeFilter } = context;
    const [rule, setRule] = useState({ type: 'one of', value: props.defaultValue ?? [] });
    useEffect(() => {
        if (rule.value.length) {
            upsertFilter(props.fid, rule);
            return () => removeFilter(props.fid);
        }
        return () => { };
    }, [rule]);
    const field = useMemo(() => {
        return { fid: props.fid, analyticType: 'dimension', name: props.name, semanticType: 'nominal', rule };
    }, [props.fid, props.name, rule]);
    return (React.createElement(ShadowDom, { uiTheme: props.uiTheme },
        React.createElement(ComputationContext.Provider, { value: computation },
            React.createElement(SimpleOneOfSelector, { field: field, allFields: emptyField, onChange: setRule }))));
}
export function RangeFilter(props) {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use filter outside of ComputationProvider');
    }
    const { computation, upsertFilter, removeFilter } = context;
    const [rule, setRule] = useState({ type: 'range', value: props.defaultValue ?? [0, 0] });
    useEffect(() => {
        if (!isEmptyRange(rule.value)) {
            upsertFilter(props.fid, rule);
            return () => removeFilter(props.fid);
        }
        return () => { };
    }, [rule]);
    const field = useMemo(() => {
        return { fid: props.fid, analyticType: 'measure', name: props.name, semanticType: 'quantitative', rule };
    }, [props.fid, props.name, rule]);
    return (React.createElement(ShadowDom, { uiTheme: props.uiTheme },
        React.createElement(ComputationContext.Provider, { value: computation },
            React.createElement(SimpleRange, { field: field, allFields: emptyField, onChange: setRule }))));
}
export function TemporalFilter(props) {
    const context = useContext(FilterComputationContext);
    if (!context) {
        throw new Error('cannot use filter outside of ComputationProvider');
    }
    const { computation, upsertFilter, removeFilter } = context;
    const [rule, setRule] = useState({ type: 'temporal range', value: props.defaultValue ?? [0, 0] });
    useEffect(() => {
        if (!isEmptyRange(rule.value)) {
            upsertFilter(props.fid, rule);
            return () => removeFilter(props.fid);
        }
        return () => { };
    }, [rule]);
    const field = useMemo(() => {
        return { fid: props.fid, analyticType: 'dimension', name: props.name, semanticType: 'temporal', rule };
    }, [props.fid, props.name, rule]);
    return (React.createElement(ShadowDom, { uiTheme: props.uiTheme },
        React.createElement(ComputationContext.Provider, { value: computation },
            React.createElement(SimpleTemporalRange, { field: field, allFields: emptyField, onChange: setRule }))));
}
export function useComputedValue(payload) {
    const { dataComputation } = useContext(FilterComputationContext);
    const [value, setValue] = useState(null);
    useEffect(() => {
        (async () => {
            setValue(null);
            const result = await dataComputation(payload);
            setValue(result);
        })();
    }, [dataComputation, payload]);
    return value;
}
export function useAggergateValue(fid, aggName) {
    const payload = useMemo(() => {
        return {
            workflow: [
                {
                    type: 'view',
                    query: [
                        {
                            op: 'aggregate',
                            groupBy: [],
                            measures: [{ agg: aggName, field: fid, asFieldKey: 'value' }],
                        },
                    ],
                },
            ],
        };
    }, [fid, aggName]);
    const result = useComputedValue(payload);
    return result?.[0]?.value;
}
//# sourceMappingURL=index.js.map