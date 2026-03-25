const throttle = (fn, time, options) => {
    const { leading = true, trailing = false } = options ?? {};
    let dirty = false;
    let hasTrailing = false;
    const throttled = () => {
        if (dirty) {
            hasTrailing = true;
            return;
        }
        dirty = true;
        if (leading) {
            fn();
        }
        setTimeout(() => {
            if (hasTrailing && trailing) {
                fn();
            }
            dirty = false;
            hasTrailing = false;
        }, time);
    };
    return throttled;
};
export default throttle;
//# sourceMappingURL=throttle.js.map