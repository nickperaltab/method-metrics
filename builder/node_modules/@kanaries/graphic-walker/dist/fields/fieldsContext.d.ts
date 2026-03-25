import React from 'react';
import { IDraggableStateKey } from '../interfaces';
export declare const blockContext: React.Context<React.RefObject<HTMLDivElement>>;
export declare function refMapper<T extends HTMLElement>(refCallback: (node: T | null) => void): (node: T | null) => void;
export declare const FieldsContextWrapper: React.FC<{
    children?: React.ReactNode | Iterable<React.ReactNode>;
}>;
export default FieldsContextWrapper;
export declare const DRAGGABLE_STATE_KEYS: Readonly<IDraggableStateKey[]>;
