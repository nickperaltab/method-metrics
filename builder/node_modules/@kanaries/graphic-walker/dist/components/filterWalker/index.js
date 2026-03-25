import React, { useEffect } from 'react';
import { getFieldDistinctCounts, getRange, getTemporalRange } from '../../computation';
import { addFilterForQuery } from '../../utils/workflow';
import { getComputation } from '../../computation/clientComputation';
const emptyArray = [];
const isEmptyRange = (a) => a[0] === 0 && a[1] === 0;
const isSameRange = (a, b) => {
    return a[0] === b[0] && a[1] === b[1];
};
const isNominalType = (type) => type === 'nominal' || type === 'ordinal';
function wrapArray(arr) {
    if (arr.length === 0)
        return emptyArray;
    return arr;
}
function getDomainAndValue(mode, index, domains, values) {
    if (!domains[index] || !values[index])
        return null;
    if (mode === 'range') {
        return {
            tag: 'range',
            domain: domains[index],
            value: values[index],
        };
    }
    return {
        tag: 'array',
        domain: domains[index],
        value: values[index],
    };
}
export function createFilterContext(components) {
    return function FilterContext(props) {
        const { configs, data, computation: remoteComputation, fields, children, loadingContent } = props;
        const computation = React.useMemo(() => {
            if (remoteComputation)
                return remoteComputation;
            if (data)
                return getComputation(data);
            throw new Error('You should provide either dataSource or computation to use FilterContext.');
        }, [data, remoteComputation]);
        const [loading, setLoading] = React.useState(true);
        const computationRef = React.useRef(computation);
        const valuesRef = React.useRef(new Map());
        const domainsRef = React.useRef(new Map());
        const [values, setValues] = React.useState([]);
        const [domains, setDomains] = React.useState([]);
        const resolvedFields = React.useMemo(() => configs.flatMap((x) => {
            const f = fields.find((a) => a.fid === x.fid);
            if (!f)
                return [];
            return [{ fid: x.fid, name: f.name ?? f.fid, mode: x.mode, type: f.semanticType, offset: f.offset, defaultValue: x.defaultValue }];
        }), [configs, fields]);
        useEffect(() => {
            (async () => {
                if (computationRef.current !== computation) {
                    computationRef.current = computation;
                    valuesRef.current.clear();
                    domainsRef.current.clear();
                }
                setLoading(true);
                const domainsP = resolvedFields.map(async (x) => {
                    const k = `${x.mode === 'range' ? x.type : x.mode}__${x.fid}`;
                    if (domainsRef.current.has(k)) {
                        return domainsRef.current.get(k);
                    }
                    if (x.mode === 'single' || x.mode === 'multi') {
                        const p = getFieldDistinctCounts(computation, x.fid, { sortBy: 'count_dsc' }).then((x) => x.map((i) => i.value));
                        domainsRef.current.set(k, p);
                        return p;
                    }
                    switch (x.type) {
                        case 'quantitative': {
                            const p = getRange(computation, x.fid);
                            domainsRef.current.set(k, p);
                            return p;
                        }
                        case 'temporal': {
                            const p = getTemporalRange(computation, x.fid, x.offset);
                            domainsRef.current.set(k, p);
                            return p;
                        }
                        default:
                            throw new Error('Cannot use range on nominal/ordinal field.');
                    }
                });
                const domains = await Promise.all(domainsP);
                const values = resolvedFields.map((x, i) => {
                    const k = `${x.mode}__${x.fid}__${isNominalType(x.type) ? 'n' : 'q'}`;
                    if (x.defaultValue) {
                        return x.defaultValue instanceof Array ? x.defaultValue : [x.defaultValue];
                    }
                    if (valuesRef.current.has(k)) {
                        return valuesRef.current.get(k);
                    }
                    if (x.mode === 'single' || x.mode === 'multi') {
                        const v = [];
                        valuesRef.current.set(k, v);
                        return v;
                    }
                    const [min, max] = domains[i];
                    const v = [min, max];
                    valuesRef.current.set(k, v);
                    return v;
                });
                setValues(values);
                setDomains(domains);
                setLoading(false);
            })();
        }, [computation, fields]);
        const filters = wrapArray(React.useMemo(() => {
            const defaultOffset = new Date().getTimezoneOffset();
            return resolvedFields
                .map(({ mode, type, fid, offset }, i) => {
                const data = getDomainAndValue(mode, i, domains, values);
                if (!data)
                    return null;
                const { domain, tag, value } = data;
                if (tag === 'array') {
                    if (value.length === 0)
                        return null;
                    if (type === 'quantitative' || (type === 'temporal' && value.every((x) => !isNaN(Number(x))))) {
                        return createFilter(fid, value.map((x) => Number(x)));
                    }
                    return createFilter(fid, value);
                }
                // value and domain is rangeValue
                switch (type) {
                    case 'quantitative':
                        return isSameRange(value, domain) ? null : createRangeFilter(fid, value[0], value[1]);
                    case 'temporal':
                        const d = domain;
                        return isSameRange(value, domain) ? null : createDateFilter(fid, value[0], value[1], d[2], offset ?? defaultOffset);
                    default:
                        throw new Error('Cannot use range on nominal/ordinal field.');
                }
            })
                .filter((x) => !!x);
        }, [values, fields]));
        const filteredComputation = React.useMemo(() => {
            return (query) => computation(addFilterForQuery(query, filters));
        }, [filters, computation]);
        const elements = React.useMemo(() => resolvedFields.map(({ mode, type, name, fid }, i) => {
            const data = getDomainAndValue(mode, i, domains, values);
            if (!data)
                return React.createElement(React.Fragment, null);
            const { tag, domain, value } = data;
            if (tag === 'array') {
                if (mode === 'single') {
                    return (React.createElement(components.SingleSelect, { key: fid, name: name, options: domain, value: value[0], onChange: (value) => setValues((v) => v.map((x, index) => {
                            if (index === i) {
                                return value === undefined ? [] : [value];
                            }
                            return x;
                        })) }));
                }
                else if (mode === 'multi') {
                    return (React.createElement(components.MultiSelect, { key: fid, name: name, options: domain, value: value, onChange: (value) => setValues((v) => v.map((x, index) => (index === i ? value : x))) }));
                }
            }
            if (tag === 'range') {
                switch (type) {
                    case 'quantitative':
                        return (React.createElement(components.RangeSelect, { key: fid, name: name, domain: domain, value: value, onChange: (value) => setValues((v) => v.map((x, index) => (index === i ? value : x))) }));
                    case 'temporal':
                        return (React.createElement(components.TemporalSelect, { key: fid, name: name, domain: domain, value: value, onChange: (value) => setValues((v) => v.map((x, index) => (index === i ? value : x))) }));
                    default:
                        throw new Error('Cannot use range on nominal/ordinal field.');
                }
            }
            return React.createElement(React.Fragment, null);
        }), [fields, values, domains]);
        if (loading) {
            return React.createElement(React.Fragment, null, loadingContent);
        }
        return children(filteredComputation, elements);
    };
}
function createDateFilter(fid, from, to, format, offset) {
    return {
        fid,
        rule: {
            type: 'temporal range',
            value: [from, to],
            format,
            offset,
        },
    };
}
function createRangeFilter(fid, from, to) {
    return {
        fid,
        rule: {
            type: 'range',
            value: [from, to],
        },
    };
}
function createFilter(fid, value) {
    return {
        fid,
        rule: {
            type: 'one of',
            value: value,
        },
    };
}
export const useTemporalFilter = (computation, fid, initValue, offset) => {
    const [value, setValue] = React.useState(initValue ?? [0, 0]);
    const [domain, setDomain] = React.useState([0, 0]);
    const [format, setFormat] = React.useState('');
    useEffect(() => {
        (async () => {
            const [min, max, format] = await getTemporalRange(computation, fid);
            const newDomain = [min, max];
            setDomain(newDomain);
            setFormat(format);
            if (isEmptyRange(value))
                setValue(newDomain);
        })();
    }, [computation, fid]);
    const filter = React.useMemo(() => (isSameRange(value, domain) ? null : createDateFilter(fid, value[0], value[1], format, offset ?? new Date().getTimezoneOffset())), [value, domain, fid]);
    return {
        filter,
        domain,
        value,
        setValue,
    };
};
export const useQuantitativeFilter = (computation, fid, initValue) => {
    const [value, setValue] = React.useState(initValue ?? [0, 0]);
    const [domain, setDomain] = React.useState([0, 0]);
    useEffect(() => {
        (async () => {
            const domain = await getRange(computation, fid);
            setDomain(domain);
            if (isEmptyRange(value))
                setValue(domain);
        })();
    }, [computation, fid]);
    const filter = React.useMemo(() => (isSameRange(value, domain) ? null : createRangeFilter(fid, value[0], value[1])), [value, domain, fid]);
    return {
        filter,
        domain,
        value,
        setValue,
    };
};
export const useNominalFilter = (computation, fid, initValue) => {
    const [value, setValue] = React.useState(initValue ?? []);
    const [domain, setDomain] = React.useState([]);
    useEffect(() => {
        (async () => {
            const domain = await getFieldDistinctCounts(computation, fid, { sortBy: 'count_dsc' });
            setDomain(domain.map((x) => x.value));
        })();
    }, [computation, fid]);
    const filter = React.useMemo(() => (value.length === 0 ? null : createFilter(fid, value)), [value, fid]);
    return {
        filter,
        domain,
        value,
        setValue,
    };
};
//# sourceMappingURL=index.js.map