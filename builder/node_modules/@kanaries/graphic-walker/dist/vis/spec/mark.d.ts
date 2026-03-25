import { ISemanticType } from "../../interfaces";
/**
 *
 * @param subViewFieldsSemanticTypes subViewFieldsSemanticTypes.length <= 2, subView means the single view visualization in facet system, we only need to consider the semantic types of the fields in the subView
 * @returns geom(mark) type
 */
export declare function autoMark(subViewFieldsSemanticTypes: ISemanticType[], aggregate?: boolean | undefined): string;
