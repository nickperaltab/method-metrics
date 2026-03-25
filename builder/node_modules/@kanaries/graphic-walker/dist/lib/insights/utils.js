export function groupByAnalyticTypes(fields) {
    const dimensions = fields.filter((f) => f.analyticType === 'dimension');
    const measures = fields.filter((f) => f.analyticType === 'measure');
    return {
        dimensions,
        measures,
    };
}
export function complementaryFields(props) {
    return props.all.filter((f) => f.analyticType === 'dimension').filter((f) => !props.selection.find((vf) => vf.fid === f.fid));
}
//# sourceMappingURL=utils.js.map