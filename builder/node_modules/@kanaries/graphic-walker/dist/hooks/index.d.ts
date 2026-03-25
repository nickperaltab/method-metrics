import React from 'react';
export declare function createStreamedValueHook(wrapper: <T>(emitter: (v: T) => void) => (v: T) => void): <T>(value: T) => T;
export declare function createStreamedValueBindHook(wrapper: <T>(emitter: (v: T) => void) => (v: T) => void): <T>(value: T, setter: (v: T) => void) => [T, React.Dispatch<React.SetStateAction<T>>];
export declare const useDebounceValueBind: <T>(value: T, setter: (v: T) => void) => [T, React.Dispatch<React.SetStateAction<T>>];
/**
 * hook of state that change of value will change innerValue inplace, make reduced re-render.
 * @param value the Value to control
 */
export declare function useRefControledState<T>(value: T): readonly [T, (value: React.SetStateAction<T>) => void];
