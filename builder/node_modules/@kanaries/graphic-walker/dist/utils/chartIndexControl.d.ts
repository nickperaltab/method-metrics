interface IUseChartIndexControlOptions {
    count: number;
    index: number;
    onChange: (index: number) => void;
}
export declare const useChartIndexControl: (options: IUseChartIndexControlOptions) => void;
export {};
