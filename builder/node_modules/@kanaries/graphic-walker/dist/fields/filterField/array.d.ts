export declare class SparseArray<T> {
    private tree;
    private constructor();
    static create<T>(): SparseArray<T>;
    get(index: number): T | null;
    set(index: number, item: T): SparseArray<T>;
    slice(start: number, end: number): (T | null)[];
    putIn(start: number, items: T[]): SparseArray<T>;
}
