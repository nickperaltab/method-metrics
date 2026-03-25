export type OffsetDate = Date & {
    _offset: never;
};
export declare function getOffsetDate(date: Date, offset: number): OffsetDate;
export declare const unexceptedUTCParsedPattern: RegExp[];
export declare const unexceptedUTCParsedPatternFormats: string[];
export declare function newOffsetDate(offset?: number): {
    (): OffsetDate;
    (value: number | string | Date): OffsetDate;
    (value: number | string | Date | null): OffsetDate | null;
    (year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): OffsetDate;
};
export declare function parsedOffsetDate(displayOffset: number | null | undefined, parseOffset: number | null | undefined): {
    (): OffsetDate;
    (value: number | string | Date): OffsetDate;
    (value: number | string | Date | null): OffsetDate | null;
    (year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): OffsetDate;
};
