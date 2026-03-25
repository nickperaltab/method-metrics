import React from 'react';
import { DroppableProvided } from '@kanaries/react-beautiful-dnd';
import { IDraggableViewStateKey } from '../../interfaces';
interface FieldContainerProps {
    provided: DroppableProvided;
    /**
     * draggable Field Id
     */
    dkey: IDraggableViewStateKey;
}
declare const _default: React.FunctionComponent<FieldContainerProps>;
export default _default;
