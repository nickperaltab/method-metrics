export function getOffsetDate(date, offset) {
    return new Proxy(new Date(date.getTime() - offset * 60000), {
        get(target, p) {
            if (typeof p === 'string') {
                if (p === 'getTime') {
                    return () => target.getTime() + offset * 60000;
                }
                if (p.startsWith('get') && !p.includes('UTC')) {
                    return target[p.replace('get', 'getUTC')].bind(target);
                }
                if (p.startsWith('set') && !p.includes('UTC')) {
                    return (...args) => target[p.replace('set', 'setUTC')].call(target, ...args) + offset * 60000;
                }
            }
            return target[p].bind(target);
        },
    });
}
export const unexceptedUTCParsedPattern = [
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,
    /^\d{4}-(0[1-9]|1[0-2])$/,
    /^\d{4}$/, // YYYY
];
export const unexceptedUTCParsedPatternFormats = ['%Y', '%Y-%m', '%Y-%m-%d'];
export function newOffsetDate(offset = new Date().getTimezoneOffset()) {
    function creator(...args) {
        if (args.length > 1) {
            const timestamp = offset * 60000 +
                Date.UTC(...args);
            return getOffsetDate(new Date(timestamp), offset);
        }
        if (args.length > 0) {
            const v = args[0];
            if (v instanceof Date) {
                return getOffsetDate(v, offset);
            }
            if (typeof v === 'string') {
                if (unexceptedUTCParsedPattern.find((regex) => regex.test(v))) {
                    const utcDate = new Date(v).getTime();
                    return getOffsetDate(new Date(utcDate + offset * 60000), offset);
                }
                if (/(Z|[\+\-][0-2][0-9])$/.test(v)) {
                    // the timezone information is included in string
                    return getOffsetDate(new Date(v), offset);
                }
                const currentDate = new Date(v);
                const utcDate = currentDate.getTime() - currentDate.getTimezoneOffset() * 60000;
                return getOffsetDate(new Date(utcDate + offset * 60000), offset);
            }
            if (v === null || v === undefined) {
                return null;
            }
            return getOffsetDate(new Date(v), offset);
        }
        return getOffsetDate(new Date(), offset);
    }
    return creator;
}
export function parsedOffsetDate(displayOffset, parseOffset) {
    const toOffset = newOffsetDate(displayOffset ?? new Date().getTimezoneOffset());
    const parse = newOffsetDate(parseOffset ?? new Date().getTimezoneOffset());
    function creator(...args) {
        return toOffset(parse(...args));
    }
    return creator;
}
//# sourceMappingURL=offset.js.map