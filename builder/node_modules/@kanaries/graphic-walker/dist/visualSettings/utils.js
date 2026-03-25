export function omitRedundantSeparator(items) {
    const omitted = items.filter((item, index) => typeof item !== 'string' || item !== '-' || items[index + 1] !== '-');
    return omitted.slice(omitted[0] === '-' ? 1 : 0, omitted[omitted.length - 1] === '-' ? -1 : undefined);
}
//# sourceMappingURL=utils.js.map