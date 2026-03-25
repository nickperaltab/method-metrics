import { DraggableFieldState } from '../interfaces';
/**
 * Algebra lint is the lint fix encoding settings in algebra stage in the grammar of graphics.
 * graphic-walker calculates the algebra on spitial channels (axises) (for now, rows, columns)
 * This steps mainly decide how the sql is generated.
 * @param encodings
 * @returns
 */
export declare function algebraLint<T extends Partial<DraggableFieldState>>(geom: string, encodings: T): Partial<T>;
