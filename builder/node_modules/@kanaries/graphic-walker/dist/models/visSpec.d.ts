import { DraggableFieldState } from '../interfaces';
export declare const viewEncodingKeys: (geom: string) => Exclude<keyof DraggableFieldState, 'filters'>[];
