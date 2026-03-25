import { getTimeFormat } from '../lib/inferMeta';
import { newOffsetDate } from '../lib/op/offset';
import { processExpression } from '../utils/workflow';
import { binarySearchClosest, isNotEmpty, parseKeyword } from '../utils';
import { COUNT_FIELD_ID } from '../constants';
import { range } from 'lodash-es';
export const datasetStats = async (service) => {
    const res = (await service({
        workflow: [
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [],
                        measures: [
                            {
                                field: '*',
                                agg: 'count',
                                asFieldKey: 'count',
                            },
                        ],
                    },
                ],
            },
        ],
    }));
    return {
        rowCount: res[0]?.count ?? 0,
    };
};
export const dataReadRaw = async (service, pageSize, pageOffset = 0, option) => {
    const res = await service({
        workflow: [
            ...(option?.filters && option.filters.length > 0
                ? [
                    {
                        type: 'filter',
                        filters: option.filters,
                    },
                ]
                : []),
            {
                type: 'view',
                query: [
                    {
                        op: 'raw',
                        fields: ['*'],
                    },
                ],
            },
            ...(option?.sorting
                ? [
                    {
                        type: 'sort',
                        by: [option.sorting.fid],
                        sort: option.sorting.sort,
                    },
                ]
                : []),
        ],
        limit: pageSize,
        offset: pageOffset * pageSize,
    });
    return res;
};
export const dataQuery = async (service, workflow, limit) => {
    const viewWorkflow = workflow.find((x) => x.type === 'view');
    if (viewWorkflow && viewWorkflow.query.length === 1 && viewWorkflow.query[0].op === 'raw' && viewWorkflow.query[0].fields.length === 0) {
        return [];
    }
    const res = await service({
        workflow,
        limit,
    });
    return res;
};
// TODO: refactor this function
export const fieldStat = async (service, field, options, allFields) => {
    const { values = true, range = true, valuesMeta = true, sortBy = 'none', timezoneDisplayOffset, keyword } = options;
    const COUNT_ID = `count_${field.fid}`;
    const TOTAL_DISTINCT_ID = `total_distinct_${field.fid}`;
    const MIN_ID = `min_${field.fid}`;
    const MAX_ID = `max_${field.fid}`;
    const k = isNotEmpty(keyword) ? parseKeyword(keyword) : undefined;
    const filterWork = k
        ? [
            {
                type: 'filter',
                filters: [{ fid: field.fid, rule: { type: 'regexp', value: k.source, caseSensitive: !k.ignoreCase } }],
            },
        ]
        : [];
    const transformWork = field.computed
        ? [
            {
                type: 'transform',
                transform: [
                    {
                        expression: processExpression(field.expression, allFields, { timezoneDisplayOffset }),
                        key: field.fid,
                    },
                ],
            },
        ]
        : [];
    const valuesMetaQueryPayload = {
        workflow: [
            ...transformWork,
            ...filterWork,
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [field.fid],
                        measures: [
                            {
                                field: '*',
                                agg: 'count',
                                asFieldKey: COUNT_ID,
                            },
                        ],
                    },
                ],
            },
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [],
                        measures: [
                            {
                                field: '*',
                                agg: 'count',
                                asFieldKey: TOTAL_DISTINCT_ID,
                            },
                            {
                                field: COUNT_ID,
                                agg: 'sum',
                                asFieldKey: 'count',
                            },
                        ],
                    },
                ],
            },
        ],
    };
    const valuesQueryPayload = {
        workflow: [
            ...transformWork,
            ...filterWork,
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [field.fid],
                        measures: [
                            {
                                field: '*',
                                agg: 'count',
                                asFieldKey: COUNT_ID,
                            },
                        ],
                    },
                ],
            },
            ...(sortBy === 'none'
                ? []
                : [
                    {
                        type: 'sort',
                        by: [sortBy.startsWith('value') ? field.fid : COUNT_ID],
                        sort: sortBy.endsWith('dsc') ? 'descending' : 'ascending',
                    },
                ]),
        ],
        limit: options.valuesLimit,
        offset: options.valuesOffset,
    };
    const [valuesMetaRes = { [TOTAL_DISTINCT_ID]: 0, count: 0 }] = valuesMeta ? await service(valuesMetaQueryPayload) : [{ [TOTAL_DISTINCT_ID]: 0, count: 0 }];
    const valuesRes = values ? await service(valuesQueryPayload) : [];
    const rangeQueryPayload = {
        workflow: [
            ...transformWork,
            ...filterWork,
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [],
                        measures: [
                            {
                                field: field.fid,
                                agg: 'min',
                                asFieldKey: MIN_ID,
                            },
                            {
                                field: field.fid,
                                agg: 'max',
                                asFieldKey: MAX_ID,
                            },
                        ],
                    },
                ],
            },
        ],
    };
    const [rangeRes = {
        [MIN_ID]: 0,
        [MAX_ID]: 0,
    },] = range
        ? await service(rangeQueryPayload)
        : [
            {
                [MIN_ID]: 0,
                [MAX_ID]: 0,
            },
        ];
    const selectedCountWork = options.selectedCount?.length
        ? {
            workflow: [
                ...transformWork,
                ...filterWork,
                {
                    type: 'filter',
                    filters: [
                        {
                            fid: field.fid,
                            rule: {
                                type: 'one of',
                                value: options.selectedCount,
                            },
                        },
                    ],
                },
                {
                    type: 'view',
                    query: [
                        {
                            op: 'aggregate',
                            groupBy: [],
                            measures: [
                                {
                                    field: '*',
                                    agg: 'count',
                                    asFieldKey: 'count',
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        : null;
    const [selectedCountRes = { count: 0 }] = selectedCountWork ? await service(selectedCountWork) : [];
    return {
        values: valuesRes.map((row) => ({
            value: row[field.fid],
            count: row[COUNT_ID],
        })),
        valuesMeta: {
            total: valuesMetaRes.count,
            distinctTotal: valuesMetaRes[TOTAL_DISTINCT_ID],
        },
        range: [rangeRes[MIN_ID], rangeRes[MAX_ID]],
        selectedCount: selectedCountRes.count,
    };
};
export async function getRange(service, field) {
    const MIN_ID = `min_${field}`;
    const MAX_ID = `max_${field}`;
    const rangeQueryPayload = {
        workflow: [
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [],
                        measures: [
                            {
                                field,
                                agg: 'min',
                                asFieldKey: MIN_ID,
                            },
                            {
                                field,
                                agg: 'max',
                                asFieldKey: MAX_ID,
                            },
                        ],
                    },
                ],
            },
        ],
    };
    const [rangeRes = {
        [MIN_ID]: 0,
        [MAX_ID]: 0,
    },] = await service(rangeQueryPayload);
    return [rangeRes[MIN_ID], rangeRes[MAX_ID]];
}
export function withComputedField(field, allFields, service, config) {
    return (builder) => {
        const transformWork = field.computed
            ? [
                {
                    type: 'transform',
                    transform: [
                        {
                            expression: processExpression(field.expression, allFields, config),
                            key: field.fid,
                        },
                    ],
                },
            ]
            : [];
        return builder((queryPayload) => {
            const transformedQueryPayload = {
                ...queryPayload,
                workflow: [...transformWork, ...queryPayload.workflow],
            };
            return service(transformedQueryPayload);
        });
    };
}
export async function getSample(service, field) {
    const res = await service({
        workflow: [
            {
                type: 'view',
                query: [
                    {
                        op: 'raw',
                        fields: [field],
                    },
                ],
            },
        ],
        limit: 1,
        offset: 0,
    });
    return res?.[0]?.[field];
}
export async function getTemporalRange(service, field, offset) {
    const sample = await getSample(service, field);
    const format = getTimeFormat(sample);
    const usedOffset = offset ?? new Date().getTimezoneOffset();
    const newDate = newOffsetDate(usedOffset);
    const MIN_ID = `min_${field}`;
    const MAX_ID = `max_${field}`;
    const rangeQueryPayload = {
        workflow: [
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [],
                        measures: [
                            {
                                field,
                                agg: 'min',
                                asFieldKey: MIN_ID,
                                format,
                                offset: usedOffset,
                            },
                            {
                                field,
                                agg: 'max',
                                asFieldKey: MAX_ID,
                                format,
                                offset: usedOffset,
                            },
                        ],
                    },
                ],
            },
        ],
    };
    const [rangeRes = {
        [MIN_ID]: 0,
        [MAX_ID]: 0,
    },] = await service(rangeQueryPayload);
    return [newDate(rangeRes[MIN_ID]).getTime(), newDate(rangeRes[MAX_ID]).getTime(), format];
}
export async function getFieldDistinctMeta(service, field) {
    const COUNT_ID = `count_${field}`;
    const TOTAL_DISTINCT_ID = `total_distinct_${field}`;
    const workflow = [
        {
            type: 'view',
            query: [
                {
                    op: 'aggregate',
                    groupBy: [field],
                    measures: [
                        {
                            field: '*',
                            agg: 'count',
                            asFieldKey: COUNT_ID,
                        },
                    ],
                },
            ],
        },
        {
            type: 'view',
            query: [
                {
                    op: 'aggregate',
                    groupBy: [],
                    measures: [
                        {
                            field: '*',
                            agg: 'count',
                            asFieldKey: TOTAL_DISTINCT_ID,
                        },
                        {
                            field: COUNT_ID,
                            agg: 'sum',
                            asFieldKey: 'count',
                        },
                    ],
                },
            ],
        },
    ];
    const [valuesMetaRes = { [TOTAL_DISTINCT_ID]: 0, count: 0 }] = await service({ workflow });
    return {
        total: valuesMetaRes.count,
        distinctTotal: valuesMetaRes[TOTAL_DISTINCT_ID],
    };
}
export async function getFieldDistinctCounts(service, field, options = {}) {
    const { sortBy = 'none', valuesLimit, valuesOffset } = options;
    const COUNT_ID = `count_${field}`;
    const valuesQueryPayload = {
        workflow: [
            {
                type: 'view',
                query: [
                    {
                        op: 'aggregate',
                        groupBy: [field],
                        measures: [
                            {
                                field: '*',
                                agg: 'count',
                                asFieldKey: COUNT_ID,
                            },
                        ],
                    },
                ],
            },
            ...(sortBy === 'none'
                ? []
                : [
                    {
                        type: 'sort',
                        by: [sortBy.startsWith('value') ? field : COUNT_ID],
                        sort: sortBy.endsWith('dsc') ? 'descending' : 'ascending',
                    },
                ]),
        ],
        limit: valuesLimit,
        offset: valuesOffset,
    };
    const valuesRes = await service(valuesQueryPayload);
    return valuesRes.map((row) => ({
        value: row[field],
        count: row[COUNT_ID],
    }));
}
export async function profileNonmialField(service, field) {
    const TOPS_NUM = 2;
    const meta = getFieldDistinctMeta(service, field);
    const tops = getFieldDistinctCounts(service, field, { sortBy: 'count_dsc', valuesLimit: TOPS_NUM });
    return Promise.all([meta, tops]);
}
export async function profileQuantitativeField(service, field) {
    const BIN_FIELD = `bin_${field}`;
    const ROW_NUM_FIELD = `${COUNT_FIELD_ID}_sum`;
    const BIN_SIZE = 10;
    const workflow = [
        {
            type: 'transform',
            transform: [
                {
                    key: BIN_FIELD,
                    expression: {
                        op: 'bin',
                        as: BIN_FIELD,
                        params: [
                            {
                                type: 'field',
                                value: field,
                            },
                        ],
                        num: BIN_SIZE,
                    },
                },
                {
                    key: COUNT_FIELD_ID,
                    expression: {
                        op: 'one',
                        params: [],
                        as: COUNT_FIELD_ID,
                    },
                },
            ],
        },
        {
            type: 'view',
            query: [
                {
                    op: 'aggregate',
                    groupBy: [BIN_FIELD],
                    measures: [
                        {
                            field: COUNT_FIELD_ID,
                            agg: 'sum',
                            asFieldKey: ROW_NUM_FIELD,
                        },
                    ],
                },
            ],
        },
    ];
    const valuesRes = service({ workflow });
    const values = (await valuesRes).sort((x, y) => x[BIN_FIELD][0] - y[BIN_FIELD][0]);
    if (values.length === 0) {
        return {
            max: 0,
            min: 0,
            binValues: [],
        };
    }
    const min = values[0][BIN_FIELD][0];
    const max = values[values.length - 1][BIN_FIELD][1];
    const step = (max - min) / BIN_SIZE;
    const binValues = range(0, BIN_SIZE)
        .map((x) => x * step + min)
        .map((bin) => {
        const row = binarySearchClosest(values, bin, (row) => row[BIN_FIELD][0]);
        const binValue = row[BIN_FIELD][0];
        if (Math.abs(binValue - bin) * 2 < step) {
            // accepted nearest (to ignore float presision)
            const count = row[ROW_NUM_FIELD];
            return {
                from: bin,
                to: bin + step,
                count,
            };
        }
        else {
            // not found
            return {
                from: bin,
                to: bin + step,
                count: 0,
            };
        }
    });
    return {
        min,
        max,
        binValues,
    };
}
export function wrapComputationWithTag(service, tag) {
    return (payload) => {
        return service({
            ...payload,
            tag,
        });
    };
}
//# sourceMappingURL=index.js.map