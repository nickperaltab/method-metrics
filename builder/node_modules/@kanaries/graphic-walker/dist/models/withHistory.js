// mean reducer calls = (((1 + cacheDistance) * cacheDistance)<replace from cache> + cursor<replay from base>) / cacheDistance
// delta(mean reducer calls) / delta(cacheDistance) = 0.5 * cacheDistance + cursor / cacheDistance
// local minimum of mean reducer calls at [cacheDistance = sqrt(2 * cursor)]
export const cacheDistance = (cursor) => Math.floor(Math.sqrt(2 * cursor));
export function performWith(reducer) {
    return (data, action) => {
        const { base, cache, cursor, now, timeline } = data;
        return {
            base,
            now: reducer(now, action),
            cursor: cursor + 1,
            cache: cursor - cache.cursor > cacheDistance(cursor)
                ? {
                    value: reducer(cache.value, timeline[cache.cursor]),
                    cursor: cache.cursor + 1,
                }
                : cache,
            timeline: timeline.slice(0, cursor).concat([action]),
        };
    };
}
export function undoWith(reducer) {
    return (data) => {
        const { base, cache, cursor, timeline } = data;
        const newCursor = cursor - 1;
        if (newCursor < 0)
            return data;
        const rebuildCache = newCursor < cache.cursor;
        const cacheCursor = rebuildCache ? Math.max(0, newCursor - cacheDistance(newCursor)) : cache.cursor;
        const cacheValue = rebuildCache ? timeline.slice(0, cacheCursor).reduce(reducer, base) : cache.value;
        return {
            base,
            now: timeline.slice(cacheCursor, newCursor).reduce(reducer, cacheValue),
            cache: rebuildCache ? { value: cacheValue, cursor: cacheCursor } : cache,
            cursor: newCursor,
            timeline,
        };
    };
}
export function redoWith(reducer) {
    return (data) => {
        const { base, cache, cursor, now, timeline } = data;
        if (cursor === timeline.length)
            return data;
        return {
            base,
            now: reducer(now, timeline[cursor]),
            cursor: cursor + 1,
            cache: cursor - cache.cursor > cacheDistance(cursor)
                ? {
                    value: reducer(cache.value, timeline[cache.cursor]),
                    cursor: cache.cursor + 1,
                }
                : cache,
            timeline,
        };
    };
}
export function freeze(data) {
    return {
        base: data.now,
        cache: {
            value: data.now,
            cursor: 0,
        },
        cursor: 0,
        now: data.now,
        timeline: [],
    };
}
export function atWith(reducer) {
    return (data, cursor) => {
        if (cursor > data.cursor)
            return data.now;
        if (cursor > data.cache.cursor)
            return data.timeline.slice(data.cache.cursor, cursor).reduce(reducer, data.cache.value);
        return data.timeline.slice(0, cursor).reduce(reducer, data.base);
    };
}
export function create(data) {
    return {
        base: data,
        cursor: 0,
        cache: {
            value: data,
            cursor: 0,
        },
        now: data,
        timeline: [],
    };
}
//# sourceMappingURL=withHistory.js.map