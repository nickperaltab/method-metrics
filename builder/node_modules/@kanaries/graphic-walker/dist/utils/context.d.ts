import React, { Context, ContextType } from 'react';
export declare function composeContext<T extends Record<string, Context<any>>>(contexts: T): (props: {
    children?: React.ReactNode | Iterable<React.ReactNode>;
} & { [K in keyof T]: React.ContextType<T[K]>; }) => React.ReactNode | Iterable<React.ReactNode>;
