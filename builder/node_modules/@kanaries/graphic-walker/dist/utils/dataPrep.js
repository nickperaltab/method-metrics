import { isPlainObject } from "./is-plain-object";
function updateRowKeys(data, keyEncodeList) {
    return data.map((row) => {
        const newRow = {};
        for (let k in keyEncodeList) {
            const { from, to } = keyEncodeList[k];
            newRow[to] = getValueByKeyPath(row, from);
        }
        return newRow;
    });
}
/**
 * parse column id(key) to a safe string
 * @param metas
 */
function parseColumnMetas(metas) {
    return metas.map((meta, i) => {
        const safeKey = `gwc_${i}`;
        return {
            ...meta,
            key: safeKey,
            fid: safeKey,
        };
    });
}
export function guardDataKeys(data, metas) {
    const safeMetas = parseColumnMetas(metas);
    const keyEncodeList = safeMetas.map((f, i) => ({
        from: metas[i].path ?? [metas[i].fid],
        to: f.fid,
    }));
    const safeData = updateRowKeys(data, keyEncodeList);
    return {
        safeData,
        safeMetas,
    };
}
export function flatKeys(obj, prefixKeys = []) {
    return Object.keys(obj).flatMap((k) => isPlainObject(obj[k]) ? flatKeys(obj[k], prefixKeys.concat(k)) : [prefixKeys.concat(k)]);
}
export function getValueByKeyPath(object, keyPath) {
    let value = object;
    for (let key of keyPath) {
        value = value[key];
    }
    return value;
}
//# sourceMappingURL=dataPrep.js.map