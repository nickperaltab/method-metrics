import React from 'react';
import { IAskVizFeedback, IChart, IViewField, IVisSpec } from '../../interfaces';
declare const _default: React.FunctionComponent<{
    api?: string | ((metas: IViewField[], query: string) => IVisSpec | IChart | PromiseLike<IVisSpec | IChart>) | undefined;
    feedbackApi?: string | ((data: IAskVizFeedback) => void) | undefined;
    headers?: Record<string, string> | undefined;
}>;
export default _default;
