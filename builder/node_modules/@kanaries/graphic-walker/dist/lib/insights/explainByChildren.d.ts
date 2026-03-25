import { IMeasure, IRow } from '../../interfaces';
import { IPredicate } from '../../utils';
export declare function explainByChildren(dataSource: IRow[], predicates: IPredicate[], dimensions: string[], measures: IMeasure[]): {
    majorList: {
        key: string;
        score: number;
        dimensions: string[];
        measures: IMeasure[];
    }[];
    outlierList: {
        key: string;
        score: number;
        dimensions: string[];
        measures: IMeasure[];
    }[];
};
