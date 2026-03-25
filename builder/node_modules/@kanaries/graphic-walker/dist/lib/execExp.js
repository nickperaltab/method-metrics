import dateTimeDrill from './op/dateTimeDrill';
import dateTimeFeature from './op/dateTimeFeature';
import { calcPaintMap, calcPaintMapV2 } from './paint';
import { expr } from './sql';
export async function execExpression(exp, dataFrame) {
    const { op, params, num } = exp;
    const subFrame = { ...dataFrame };
    const len = dataFrame[Object.keys(dataFrame)[0]].length;
    for (let param of params) {
        switch (param.type) {
            case 'field':
                subFrame[param.value] = dataFrame[param.value];
                break;
            case 'constant':
                subFrame[param.value] = new Array(len).fill(param.value);
                break;
            case 'expression':
                let f = await execExpression(param.value, dataFrame);
                Object.keys(f).forEach((key) => {
                    subFrame[key] = f[key];
                });
                break;
            case 'value':
            default:
                break;
        }
    }
    switch (op) {
        case 'one':
            return one(exp.as, params, subFrame);
        case 'log':
            return log(exp.as, params, subFrame, num);
        case 'log2':
            return log(exp.as, params, subFrame, 2);
        case 'log10':
            return log(exp.as, params, subFrame, 10);
        case 'binCount':
            return binCount(exp.as, params, subFrame, num);
        case 'bin':
            return bin(exp.as, params, subFrame, num);
        case 'dateTimeDrill':
            return dateTimeDrill(exp.as, params, subFrame);
        case 'dateTimeFeature':
            return dateTimeFeature(exp.as, params, subFrame);
        case 'paint':
            return await paint(exp.as, params, subFrame);
        case 'expr':
            return execSQL(exp.as, params, subFrame);
        default:
            return subFrame;
    }
}
function bin(resKey, params, data, binSize = 10) {
    const { value: fieldKey } = params[0];
    const fieldValues = data[fieldKey];
    let _min = Infinity;
    let _max = -Infinity;
    for (let i = 0; i < fieldValues.length; i++) {
        let val = fieldValues[i];
        if (val > _max)
            _max = val;
        if (val < _min)
            _min = val;
    }
    const step = (_max - _min) / binSize;
    const newValues = fieldValues.map((v) => {
        let bIndex = Math.floor((v - _min) / step);
        if (bIndex === binSize)
            bIndex = binSize - 1;
        if (Number.isNaN(bIndex)) {
            bIndex = 0;
        }
        return [Number((bIndex * step + _min)), Number(((bIndex + 1) * step + _min))];
    });
    return {
        ...data,
        [resKey]: newValues,
    };
}
function binCount(resKey, params, data, binSize = 10) {
    const { value: fieldKey } = params[0];
    const fieldValues = data[fieldKey];
    const valueWithIndices = fieldValues
        .map((v, i) => ({
        val: v,
        index: i,
    }))
        .sort((a, b) => a.val - b.val)
        .map((item, i) => ({
        val: item.val,
        index: item.index,
        orderIndex: i,
    }));
    const groupSize = valueWithIndices.length / binSize;
    const newValues = valueWithIndices
        .sort((a, b) => a.index - b.index)
        .map((item) => {
        let bIndex = Math.floor(item.orderIndex / groupSize);
        if (bIndex === binSize)
            bIndex = binSize - 1;
        return bIndex + 1;
    });
    return {
        ...data,
        [resKey]: newValues,
    };
}
function log(resKey, params, data, baseNum = 10) {
    const { value: fieldKey } = params[0];
    const fieldValues = data[fieldKey];
    const newField = fieldValues.map((v) => Math.log(v) / Math.log(baseNum));
    return {
        ...data,
        [resKey]: newField,
    };
}
function one(resKey, params, data) {
    // const { value: fieldKey } = params[0];
    if (Object.keys(data).length === 0)
        return data;
    const len = data[Object.keys(data)[0]].length;
    const newField = new Array(len).fill(1);
    return {
        ...data,
        [resKey]: newField,
    };
}
async function paint(resKey, params, data) {
    const param = params.find((x) => x.type === 'newmap');
    if (!param) {
        const oldParam = params.find((x) => x.type === 'map');
        if (!oldParam)
            return data;
        const map = oldParam.value;
        return {
            ...data,
            [resKey]: await calcPaintMap(data[map.x], data[map.y], map),
        };
    }
    const map = param.value;
    return {
        ...data,
        [resKey]: await calcPaintMapV2(dataframe2Dataset(data), map),
    };
}
function execSQL(resKey, params, data) {
    const param = params.find((x) => x.type === 'sql');
    if (!param)
        return data;
    const result = expr(param.value, data);
    if (result instanceof Array) {
        return {
            ...data,
            [resKey]: result,
        };
    }
    else {
        const firstKey = Object.keys(data)[0];
        if (!firstKey)
            return data;
        return {
            ...data,
            [resKey]: new Array(data[firstKey].length).fill(result),
        };
    }
}
export function dataset2DataFrame(dataset) {
    const dataFrame = {};
    if (dataset.length === 0)
        return dataFrame;
    Object.keys(dataset[0]).forEach((k) => {
        dataFrame[k] = dataset.map((row) => row[k]);
    });
    return dataFrame;
}
export function dataframe2Dataset(dataFrame) {
    const cols = Object.keys(dataFrame);
    if (cols.length === 0)
        return [];
    const dataset = [];
    const len = dataFrame[Object.keys(dataFrame)[0]].length;
    for (let i = 0; i < len; i++) {
        const row = {};
        cols.forEach((k) => {
            row[k] = dataFrame[k][i];
        });
        dataset.push(row);
    }
    return dataset;
}
//# sourceMappingURL=execExp.js.map