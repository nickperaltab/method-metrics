import { viewEncodingKeys } from "../models/visSpec";
export function getAllFields(encodings) {
    return [...encodings.dimensions, ...encodings.measures];
}
export function getViewEncodingFields(encodings, geom) {
    return viewEncodingKeys(geom).flatMap((k) => encodings[k] ?? []);
}
//# sourceMappingURL=storeStateLib.js.map