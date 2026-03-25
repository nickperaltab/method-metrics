import { nanoid } from 'nanoid';
import { fillChart } from '../models/visSpecHistory';
const encodingChannels = new Set(['column', 'row', 'color', 'opacity', 'shape', 'size', 'details', 'theta', 'x', 'y', 'facet', 'order', 'radius']);
const isSupportedChannel = (channelName) => encodingChannels.has(channelName);
const aggNames = new Set(['sum', 'count', 'max', 'min', 'mean', 'median', 'variance', 'stdev']);
const isValidAggregate = (aggName) => !!aggName && aggNames.has(aggName);
const countField = {
    fid: 'gw_count_fid',
    name: 'Row count',
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'sum',
    computed: true,
    expression: {
        op: 'one',
        params: [],
        as: 'gw_count_fid',
    },
};
const stackTransform = (s) => {
    if (s === 'zero' || s === true) {
        return 'stack';
    }
    if (s === null)
        return 'none';
    return s;
};
function sortValueTransform(vlValue) {
    let order = 'none';
    if (typeof vlValue === 'string') {
        order = vlValue;
    }
    else if (vlValue && vlValue instanceof Object) {
        order = vlValue['order'] ?? 'ascending';
    }
    if (order !== 'none') {
        const channels = ['x', 'y', 'color', 'size', 'opacity'];
        // TODO: support all sorting config in vl
        if (order.startsWith('-') || order === 'descending')
            return 'descending';
        if (channels.indexOf(order) > -1 || order === 'ascending')
            return 'ascending';
    }
    return;
}
const dimensionTypeMap = {
    row: 'facetY',
    facet: 'facetY',
    column: 'facetX',
    x: 'column',
    y: 'row',
    opacity: 'opacity',
    size: 'size',
    shape: 'shape',
    radius: 'radius',
    theta: 'theta',
    details: 'details',
    text: 'text',
    color: 'color',
};
const analogChannels = new Set(['theta', 'x', 'y']);
function createBinField(field) {
    const newId = `gw_${nanoid(4)}`;
    return {
        fid: newId,
        name: `bin(${field.name})`,
        semanticType: 'ordinal',
        analyticType: 'dimension',
        computed: true,
        expression: {
            op: 'bin',
            as: newId,
            params: [
                {
                    type: 'field',
                    value: field.fid,
                },
            ],
        },
    };
}
function encodingToDimension(name, encoding, dict) {
    switch (name) {
        case 'order':
            return {
                sort: sortValueTransform(encoding.sort),
            };
        default:
            const analogChannel = analogChannels.has(name);
            const dictField = dict.get(encoding.field) ?? countField;
            const field = encoding.bin ? createBinField(dictField) : dictField;
            const aggregate = field === countField ? 'count' : isValidAggregate(encoding.aggregate) && analogChannel ? encoding.aggregate : undefined;
            let analyticType;
            if (field === countField || aggregate) {
                analyticType = 'measure';
            }
            else if (field.analyticType === 'measure' && analogChannels.has(name)) {
                analyticType = 'auto';
            }
            else {
                analyticType = 'dimension';
            }
            return {
                dimension: field,
                binDimension: encoding.bin ? field : undefined,
                dimensionType: dimensionTypeMap[name],
                analyticType,
                aggregate,
                stack: stackTransform(encoding.stack),
                sort: encoding.sort ? sortValueTransform(encoding.sort) : undefined,
            };
    }
}
const entries = (obj) => Object.keys(obj).map((name) => ({ name, value: obj[name] }));
function getGeom(mark) {
    function mapper(geom) {
        switch (geom) {
            case 'interval':
            case 'bar':
                return 'bar';
            case 'line':
                return 'line';
            case 'boxplot':
                return 'boxplot';
            case 'area':
                return 'area';
            case 'point':
                return 'point';
            case 'arc':
                return 'arc';
            case 'circle':
                return 'circle';
            case 'heatmap':
                return 'circle';
            case 'rect':
                return 'rect';
            case 'tick':
            default:
                return 'tick';
        }
    }
    if (typeof mark === 'string') {
        return mapper(mark);
    }
    return mapper(mark.type);
}
const encodeOP = (op) => {
    switch (op) {
        case '==':
        case '===':
        case 'equal':
        case 'oneOf':
            return 'one of';
        case '!=':
        case '!==':
            return 'not in';
        case '>':
        case '>=':
        case '<':
        case '<=':
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte':
        case 'range':
            return 'range';
    }
    return 'one of';
};
function deduper(arr, keyFunction) {
    const set = new Set();
    const result = [];
    arr.forEach((item) => {
        const key = keyFunction(item);
        if (set.has(key)) {
            return;
        }
        set.add(key);
        result.push(item);
    });
    return result;
}
export function VegaliteMapper(vl, allFields, visId, name) {
    let geom = 'tick';
    const encodings = [];
    if (vl.facet) {
        encodings.push(...entries(vl.facet));
    }
    if (vl.encoding) {
        encodings.push(...entries(vl.encoding));
    }
    if (vl.mark) {
        geom = getGeom(vl.mark);
    }
    if (vl.spec) {
        geom = getGeom(vl.spec.mark);
        if (vl.spec.encoding) {
            encodings.push(...entries(vl.spec.encoding));
        }
    }
    vl.concat &&
        vl.concat.forEach((v) => {
            geom = getGeom(v.mark);
            if (v.encoding) {
                encodings.push(...entries(v.encoding));
            }
        });
    vl.hconcat &&
        vl.hconcat.forEach((v) => {
            geom = getGeom(v.mark);
            if (v.encoding) {
                encodings.push(...entries(v.encoding));
            }
        });
    vl.vconcat &&
        vl.vconcat.forEach((v) => {
            geom = getGeom(v.mark);
            if (v.encoding) {
                encodings.push(...entries(v.encoding));
            }
        });
    const config = {};
    const rules = new Map();
    const dict = new Map();
    allFields.forEach((v) => {
        dict.set(v.name, v);
    });
    const addRule = (field, op, value) => {
        const key = `${field}|${encodeOP(op)}`;
        if (!rules.has(key)) {
            rules.set(key, { field, rule: encodeOP(op), value: [] });
        }
        if (op.startsWith('>') || op.startsWith('gt')) {
            rules.get(key).value = [value, rules.get(key).value[1] ?? null];
        }
        else if (op.startsWith('<') || op.startsWith('lt')) {
            rules.get(key).value = [rules.get(key).value[0] ?? null, value];
        }
        else if (op === 'range') {
            rules.get(key).value = value;
        }
        else if (op === 'oneOf') {
            rules.get(key).value.push(...value);
        }
        else {
            rules.get(key).value.push(value);
        }
    };
    if (vl.transform) {
        vl.transform.forEach((t) => {
            if (t.fold) {
                config.folds = t.fold.map((name) => dict.get(name)?.fid ?? name);
            }
            if (t.filter) {
                if (typeof t.filter === 'string') {
                    const filters = t.filter.split(/[\&\&|\|\|]/g);
                    filters.forEach((f) => {
                        const result = /datum(\.[A-z_]+|\[['"][A-z\s_]+['"]\])\s*((\!=|==|>|<)=?)\s*(.*)/.exec(f);
                        if (result) {
                            const field = /(?:\.|\[["'])([A-z\s_]*)(?:["']\])?/.exec(result[1]);
                            const value = /["'](.*)["']/.exec(result[4]);
                            if (!field || !value) {
                                return;
                            }
                            const op = result[2];
                            addRule(field[1], op, value[1]);
                        }
                    });
                }
                if (typeof t.filter === 'object') {
                    if (t.filter.field === 'rank') {
                        if (t.filter.lte) {
                            config.limit = t.filter.lte;
                        }
                        else if (t.filter.lt) {
                            config.limit = Math.floor(t.filter.lt);
                            if (config.limit == t.filter.lt) {
                                config.limit -= 1;
                            }
                        }
                    }
                    else {
                        const op = Object.keys(t.filter).find((k) => ['equal', 'oneOf', 'lt', 'lte', 'gt', 'gte', 'range'].includes(k));
                        op && addRule(t.filter.field, op, t.filter[op]);
                    }
                }
            }
        });
    }
    const filterFields = Array.from(rules.values()).map(({ field, rule, value }) => {
        return {
            fid: field,
            rule: {
                type: rule,
                value: value,
            },
        };
    });
    const results = encodings.flatMap(({ name, value }) => (isSupportedChannel(name) ? [encodingToDimension(name, value, dict)] : []));
    const defaultAggregated = results.reduce((x, y) => x || !!y.aggregate, false);
    const sort = results.reduce((x, y) => y.sort ?? x, 'none');
    const stack = results.reduce((x, y) => y.stack ?? x, ['bar', 'area', 'arc'].includes(geom) ? 'stack' : 'none');
    const binFields = results.reduce((x, y) => (y.binDimension && !x.has(y.binDimension.name) ? x.set(y.binDimension.name, y.binDimension) : x), new Map());
    const resultFields = results.flatMap((x) => {
        if (x.dimension && x.dimensionType) {
            if (x.binDimension) {
                return [
                    {
                        name: x.dimensionType,
                        value: binFields.get(x.binDimension.name) ?? x.binDimension,
                    },
                ];
            }
            const analyticType = x.analyticType === 'auto' ? (defaultAggregated ? 'dimension' : 'measure') : x.analyticType;
            return [
                {
                    name: x.dimensionType,
                    value: {
                        ...x.dimension,
                        analyticType,
                        ...(x.aggregate
                            ? {
                                aggName: x.aggregate,
                            }
                            : {}),
                        ...(sort && sort !== 'none' && (x.dimensionType === 'column' || x.dimensionType === 'row') && analyticType === 'dimension'
                            ? {
                                sort,
                            }
                            : {}),
                    },
                },
            ];
        }
        return [];
    });
    const is = (v) => (x) => x.name === v;
    const get = (x) => x.value;
    const deduperFields = (fields) => deduper(fields, (f) => f.fid);
    return fillChart({
        visId,
        name,
        encodings: {
            dimensions: allFields.filter((x) => x.analyticType === 'dimension').concat(...binFields.values()),
            measures: allFields.filter((x) => x.analyticType === 'measure' && x.fid !== countField.fid).concat(countField),
            columns: deduperFields(resultFields
                .filter(is('facetX'))
                .concat(resultFields.filter(is('column')))
                .map(get)),
            rows: deduperFields(resultFields
                .filter(is('facetY'))
                .concat(resultFields.filter(is('row')))
                .map(get)),
            details: deduperFields(resultFields.filter(is('details')).map(get)),
            opacity: deduperFields(resultFields.filter(is('opacity')).map(get)),
            radius: deduperFields(resultFields.filter(is('radius')).map(get)),
            shape: deduperFields(resultFields.filter(is('shape')).map(get)),
            size: deduperFields(resultFields.filter(is('size')).map(get)),
            text: deduperFields(resultFields.filter(is('text')).map(get)),
            theta: deduperFields(resultFields.filter(is('theta')).map(get)),
            color: deduperFields(resultFields.filter(is('color')).map(get)),
            filters: deduper(filterFields.map((f) => {
                const originalField = dict.get(f.fid);
                return {
                    ...originalField,
                    rule: f.rule,
                };
            }), (f) => `${f.fid}_${f.rule?.type}`),
        },
        layout: {
            stack,
        },
        config: {
            defaultAggregated,
            geoms: [geom],
            ...config,
        },
    });
}
//# sourceMappingURL=vl2gw.js.map