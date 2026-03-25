export function proxied(x, ex) {
    return new Proxy(x, {
        get(target, p) {
            if (ex[p]) {
                if (typeof target[p] === 'function') {
                    return (...args) => ex[p](args, (...x) => target[p].call(target, ...x));
                }
                else {
                    return ex[p]([], target[p]);
                }
            }
            return target[p];
        },
    });
}
//# sourceMappingURL=proxy.js.map