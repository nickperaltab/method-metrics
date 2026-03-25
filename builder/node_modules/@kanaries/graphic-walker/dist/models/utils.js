import { nanoid } from 'nanoid';
export function uniqueId() {
    return 'gw_' + nanoid(4);
}
export const insert = (arr, item, index) => index === arr.length ? arr.concat([item]) : arr.flatMap((x, i) => (i === index ? [item, x] : [x]));
export const remove = (arr, index) => arr.filter((_, i) => i !== index);
export const replace = (arr, index, f) => arr.map((x, i) => (i === index ? f(x) : x));
export function mutPath(item, path, mut) {
    const mod = (d, path, f) => {
        const [k, ...rest] = path;
        if (rest.length === 0) {
            return {
                ...d,
                [k]: f(d[k]),
            };
        }
        return {
            ...d,
            [k]: mod(d[k], rest, f),
        };
    };
    return mod(item, path.split('.'), mut);
}
//# sourceMappingURL=utils.js.map