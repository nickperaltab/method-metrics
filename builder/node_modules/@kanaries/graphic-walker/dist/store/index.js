import React, { useContext, useMemo, useEffect, createContext, useRef } from 'react';
import { VizSpecStore } from './visualSpecStore';
function createKeepAliveContext(create) {
    const dict = {};
    return (key, ...args) => {
        if (key) {
            if (!dict[key])
                dict[key] = create(...args);
            return dict[key];
        }
        else {
            return create(...args);
        }
    };
}
const getVizStore = createKeepAliveContext((meta, opts) => new VizSpecStore(meta, opts));
export const VisContext = React.createContext(null);
const noop = () => { };
export const VizStoreWrapper = (props) => {
    const storeKey = props.keepAlive ? `${props.keepAlive}` : '';
    const store = useMemo(() => {
        const defaultConfig = props.defaultRenderer
            ? {
                ...props.defaultConfig,
                layout: { renderer: props.defaultRenderer, ...(props.defaultConfig?.layout ?? {}) },
            }
            : props.defaultConfig;
        return getVizStore(storeKey, props.meta, { onMetaChange: props.onMetaChange, defaultConfig });
        // IMPORTANT the store is only associated with the storeKey
    }, [storeKey]);
    const lastMeta = useRef(props.meta);
    useEffect(() => {
        if (lastMeta.current !== props.meta) {
            store.setMeta(props.meta);
            lastMeta.current = props.meta;
        }
    }, [props.meta, store]);
    const lastOnMetaChange = useRef(props.onMetaChange);
    useEffect(() => {
        if (lastOnMetaChange.current !== props.onMetaChange) {
            store.setOnMetaChange(props.onMetaChange);
            lastOnMetaChange.current = props.onMetaChange;
        }
    }, [props.meta, store]);
    const lastDefaultConfig = useRef(props.defaultConfig);
    const lastDefaultRenderer = useRef(props.defaultRenderer);
    useEffect(() => {
        if (lastDefaultConfig.current !== props.defaultConfig || lastDefaultRenderer.current !== props.defaultRenderer) {
            const defaultConfig = props.defaultRenderer
                ? { ...props.defaultConfig, layout: { renderer: props.defaultRenderer, ...(props.defaultConfig?.layout ?? {}) } }
                : props.defaultConfig;
            store.setDefaultConfig(defaultConfig);
            lastDefaultConfig.current = props.defaultConfig;
            lastDefaultRenderer.current = props.defaultRenderer;
        }
    }, [props.defaultConfig, props.defaultRenderer, store]);
    useEffect(() => {
        if (props.storeRef) {
            const ref = props.storeRef;
            ref.current = store;
            return () => {
                ref.current = null;
            };
        }
        return noop;
    }, [props.storeRef, store]);
    return React.createElement(VisContext.Provider, { value: store }, props.children);
};
export function useVizStore() {
    return useContext(VisContext);
}
export const ComputationContext = createContext(async () => []);
export function useCompututaion() {
    return useContext(ComputationContext);
}
export function withTimeout(f, timeout) {
    return (...args) => Promise.race([
        f(...args),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), timeout);
        }),
    ]);
}
export function withErrorReport(f, onError) {
    return (...args) => f(...args).catch((err) => {
        onError(err);
        throw err;
    });
}
//# sourceMappingURL=index.js.map