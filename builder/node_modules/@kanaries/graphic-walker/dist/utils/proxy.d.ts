export type ParaOrNoting<T> = T extends (...args: any) => any ? Parameters<T> : [];
export type ReturnOrID<T> = T extends (...args: any) => any ? ReturnType<T> : T;
export declare function proxied<T extends Object>(x: T, ex: {
    [k in keyof T]?: (req: ParaOrNoting<T[k]>, next: T[k]) => ReturnOrID<T[k]>;
}): T;
