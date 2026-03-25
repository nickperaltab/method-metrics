export declare const cacheDistance: (cursor: number) => number;
export type WithHistory<T, A> = {
    base: T;
    now: T;
    timeline: A[];
    cursor: number;
    cache: {
        value: T;
        cursor: number;
    };
};
export declare function performWith<T, A>(reducer: (data: T, action: A) => T): (data: WithHistory<T, A>, action: A) => WithHistory<T, A>;
export declare function undoWith<T, A>(reducer: (data: T, action: A) => T): (data: WithHistory<T, A>) => WithHistory<T, A>;
export declare function redoWith<T, A>(reducer: (data: T, action: A) => T): (data: WithHistory<T, A>) => WithHistory<T, A>;
export declare function freeze<T, A>(data: WithHistory<T, A>): WithHistory<T, A>;
export declare function atWith<T, A>(reducer: (data: T, action: A) => T): (data: WithHistory<T, A>, cursor: number) => T;
export declare function create<T>(data: T): {
    base: T;
    cursor: number;
    cache: {
        value: T;
        cursor: number;
    };
    now: T;
    timeline: never[];
};
