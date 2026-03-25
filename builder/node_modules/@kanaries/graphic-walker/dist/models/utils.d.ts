export declare function uniqueId(): string;
export type DeepPartial<T> = T extends Array<any> ? T : T extends object ? {
    [K in keyof T]?: DeepPartial<T[K]>;
} : T;
export type KVTuple<T> = keyof T extends `${infer R}` ? (R extends keyof T ? [R, T[R]] : never) : never;
export type AssertSameKey<T1 extends Record<keyof T2, any>, T2 extends Record<keyof T1, any>> = never;
export type NestedKeyOf<T> = {
    [Key in keyof T & (string | number)]: T[Key] extends object ? `${Key}` | `${Key}.${NestedKeyOf<T[Key]>}` : `${Key}`;
}[keyof T & (string | number)];
export type TypeOfPath<T, Path extends string> = Path extends `${infer A}.${infer rest}` ? A extends keyof T ? TypeOfPath<T[A], rest> : never : Path extends keyof T ? T[Path] : never;
export type ReplacePathOf<T, Path extends string, U> = {
    [K in keyof T]: Path extends `${infer A}.${infer rest}` ? (A extends K ? ReplacePathOf<T[K], rest, U> : T[K]) : Path extends K ? U : T[K];
};
export declare const insert: <T>(arr: T[], item: T, index: number) => T[];
export declare const remove: <T>(arr: T[], index: number) => T[];
export declare const replace: <T>(arr: T[], index: number, f: (item: T) => T) => T[];
export declare function mutPath<T extends object, P extends NestedKeyOf<T>, U>(item: T, path: P, mut: (x: TypeOfPath<T, P>) => U): ReplacePathOf<T, P, U>;
