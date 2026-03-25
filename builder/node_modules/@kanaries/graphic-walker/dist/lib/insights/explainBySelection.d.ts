import { IPredicate, IField, IRow, IViewField, IComputationFunction } from '../../interfaces';
import { VizSpecStore } from '../../store/visualSpecStore';
export declare function explainBySelection(props: {
    predicates: IPredicate[];
    viewFilters: VizSpecStore['viewFilters'];
    allFields: IViewField[];
    viewMeasures: IViewField[];
    viewDimensions: IViewField[];
    computationFunction: IComputationFunction;
    timezoneDisplayOffset: number | undefined;
}): Promise<{
    score: number;
    measureField: IField;
    targetField: IField;
    normalizedData: IRow[];
    normalizedParentData: IRow[];
}[]>;
