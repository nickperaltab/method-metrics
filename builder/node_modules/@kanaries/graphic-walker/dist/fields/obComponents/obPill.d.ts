import React from 'react';
import { DraggableProvided } from '@kanaries/react-beautiful-dnd';
import { IDraggableViewStateKey } from '../../interfaces';
interface PillProps {
    provided: DraggableProvided;
    fIndex: number;
    dkey: IDraggableViewStateKey;
}
declare const _default: React.FunctionComponent<PillProps>;
export default _default;
