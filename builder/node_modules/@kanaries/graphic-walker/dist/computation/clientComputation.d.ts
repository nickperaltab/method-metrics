import type { IDataQueryPayload, IDataQueryWorkflowStep, IRow } from "../interfaces";
export declare const dataQueryClient: (rawData: IRow[], workflow: IDataQueryWorkflowStep[], offset?: number, limit?: number) => Promise<IRow[]>;
export declare const getComputation: (rawData: IRow[]) => (payload: IDataQueryPayload) => Promise<IRow[]>;
