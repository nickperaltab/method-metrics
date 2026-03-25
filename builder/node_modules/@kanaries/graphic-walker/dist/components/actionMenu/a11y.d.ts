import { type HTMLAttributes, type MouseEvent, type AriaAttributes, type ComponentPropsWithoutRef } from 'react';
export type ReactTag = keyof JSX.IntrinsicElements;
export type ElementType<T extends ReactTag> = Parameters<NonNullable<ComponentPropsWithoutRef<T>['onClick']>>[0] extends MouseEvent<infer U, globalThis.MouseEvent> ? U : never;
interface IUseMenuButtonOptions {
    'aria-expanded': NonNullable<AriaAttributes['aria-expanded']>;
    onPress?: () => void;
    disabled?: boolean;
}
export declare const useMenuButton: <T extends keyof JSX.IntrinsicElements>(options: IUseMenuButtonOptions & Omit<ComponentPropsWithoutRef<T>, keyof IUseMenuButtonOptions>) => HTMLAttributes<ElementType<T>>;
export {};
