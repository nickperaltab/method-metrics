import { IField } from '../../interfaces';
export declare function groupByAnalyticTypes(fields: IField[]): {
    dimensions: IField[];
    measures: IField[];
};
export declare function complementaryFields(props: {
    selection: IField[];
    all: IField[];
}): IField[];
