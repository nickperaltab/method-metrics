import { DraggableFieldState, IViewField } from '../interfaces';
export declare function getAllFields(encodings: {
    dimensions: IViewField[];
    measures: IViewField[];
}): IViewField[];
export declare function getViewEncodingFields(encodings: Partial<Omit<DraggableFieldState, 'filters'>>, geom: string): IViewField[];
