import { getValueByKeyPath } from '../utils/dataPrep';
const COMMON_TIME_FORMAT = [
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,
    /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/,
    /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
    /^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/,
    /^\d{4}\.(0[1-9]|1[0-2])\.(0[1-9]|[12][0-9]|3[01])$/,
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\s\d{2}:\d{2}:\d{2}$/,
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T\d{2}:\d{2}:\d{2}$/,
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
    /^([1-9]|1[0-2])\/([1-9]|[12][0-9]|3[01])\/\d{4}$/,
    /^([1-9]|[12][0-9]|3[01])\/([1-9]|1[0-2])\/\d{4}$/, // d/m/YYYY
];
const TIME_FORMAT = [
    '%Y-%m-%d',
    '%m/%d/%Y',
    '%d/%m/%Y',
    '%Y/%m/%d',
    '%Y.%m.%d',
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%dT%H:%M:%S',
    '%Y-%m-%dT%H:%M:%S.%gZ',
    '%f/%e/%Y',
    '%e/%f/%Y',
];
export function getTimeFormat(data) {
    if (typeof data === 'number')
        return 'timestamp';
    const i = COMMON_TIME_FORMAT.findIndex((x) => x.test(data));
    if (i >= 0)
        return TIME_FORMAT[i];
    return '';
}
/**
 * check if this array is a date time array based on some common date format
 * @param data string array
 * @returns
 */
export function isDateTimeArray(data) {
    let isDateTime = true;
    for (let d of data) {
        let isDateTimeItem = false;
        for (let r of COMMON_TIME_FORMAT) {
            if (r.test(d)) {
                isDateTimeItem = true;
                break;
            }
        }
        if (!isDateTimeItem) {
            isDateTime = false;
            break;
        }
    }
    return isDateTime;
}
export function isNumericArray(data) {
    return data.every((item) => {
        // Check if the item is already a number
        if (typeof item === 'number') {
            return true;
        }
        // Check if the item can be converted into a number
        const number = Number(item);
        return !isNaN(number) && isFinite(item);
    });
}
function inferAnalyticTypeFromSemanticType(semanticType) {
    switch (semanticType) {
        case 'quantitative':
            return 'measure';
        default:
            return 'dimension';
    }
}
export function inferSemanticType(data, path) {
    const values = data.map((row) => getValueByKeyPath(row, path));
    let st = isNumericArray(values) ? 'quantitative' : 'nominal';
    if (st === 'nominal') {
        if (isDateTimeArray(data.map((row) => `${getValueByKeyPath(row, path)}`)))
            st = 'temporal';
    }
    return st;
}
export function inferMeta(props) {
    const { dataSource, fields } = props;
    const finalFieldMetas = [];
    for (let field of fields) {
        let semanticType = field.semanticType === '?' ? inferSemanticType(dataSource, field.path) : field.semanticType;
        let analyticType = inferAnalyticTypeFromSemanticType(semanticType);
        finalFieldMetas.push({
            fid: field.fid,
            key: field.key ? field.key : field.fid,
            name: field.name ? field.name : field.fid,
            analyticType,
            semanticType,
            basename: field.basename || field.name || field.fid,
            path: field.path,
            offset: semanticType === 'temporal' ? new Date().getTimezoneOffset() : undefined,
        });
    }
    return finalFieldMetas;
}
//# sourceMappingURL=inferMeta.js.map