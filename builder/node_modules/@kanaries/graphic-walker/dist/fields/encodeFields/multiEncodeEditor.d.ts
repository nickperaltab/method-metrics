import React from 'react';
import { DraggableFieldState } from '../../interfaces';
import { DroppableProvided } from 'react-beautiful-dnd';
import { DroppableStateSnapshot } from '@kanaries/react-beautiful-dnd';
interface MultiEncodeEditorProps {
    dkey: {
        id: keyof Omit<DraggableFieldState, 'filters'>;
    };
    provided: DroppableProvided;
    snapshot: DroppableStateSnapshot;
}
declare const _default: React.FunctionComponent<MultiEncodeEditorProps>;
export default _default;
