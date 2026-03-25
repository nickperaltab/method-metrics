import React, { useCallback } from 'react';
import { useState, useEffect, useRef } from 'react';
import debounce from 'lodash-es/debounce';
export function createStreamedValueHook(wrapper) {
    return function useStreamedValue(value) {
        const [innerValue, setInnerValue] = useState(value);
        const setter = useCallback(wrapper(setInnerValue), []);
        useEffect(() => setter(value), [value]);
        return innerValue;
    };
}
export function createStreamedValueBindHook(wrapper) {
    const useStreamedValue = createStreamedValueHook(wrapper);
    return function useStreamedValueBind(value, setter) {
        const [innerValue, setInnerValue] = useState(value);
        const valueToSet = useStreamedValue(innerValue);
        const first = useRef(true);
        useEffect(() => setInnerValue(value), [value]);
        useEffect(() => {
            if (first.current) {
                first.current = false;
            }
            else {
                setter(valueToSet);
            }
            // exclude setter to use inline function for setter and not to cause loops
        }, [valueToSet]);
        return [innerValue, setInnerValue];
    };
}
export const useDebounceValueBind = createStreamedValueBindHook((f) => debounce(f, 200));
/**
 * hook of state that change of value will change innerValue inplace, make reduced re-render.
 * @param value the Value to control
 */
export function useRefControledState(value) {
    const [innerValue, setInnerValue] = React.useState(value);
    const innerValueRef = React.useRef(innerValue);
    innerValueRef.current = innerValue;
    const valueRef = React.useRef(value);
    const useInner = React.useRef(false);
    if (valueRef.current !== value) {
        valueRef.current = value;
        useInner.current = false;
    }
    const setValue = React.useCallback((value) => {
        if (useInner.current) {
            setInnerValue(value);
        }
        else {
            useInner.current = true;
            setInnerValue(typeof value === 'function' ? value(valueRef.current) : value);
        }
    }, []);
    return [useInner.current ? innerValue : value, setValue];
}
//# sourceMappingURL=index.js.map