import React from 'react';
import { observer } from 'mobx-react-lite';
import { FieldsContainer } from '../components';
import { useVizStore } from '../../store';
import { Draggable } from '@kanaries/react-beautiful-dnd';
import OBPill from './obPill';
import { refMapper } from '../fieldsContext';
import { getFieldIdentifier } from "../../utils";
const OBFieldContainer = (props) => {
    const { provided, dkey } = props;
    const vizStore = useVizStore();
    const { allEncodings } = vizStore;
    return (React.createElement(FieldsContainer, { ...provided.droppableProps, ref: refMapper(provided.innerRef) }, allEncodings[dkey.id].map((f, index) => (React.createElement(Draggable, { key: `encode_${dkey.id}_${index}_${getFieldIdentifier(f)}`, draggableId: `encode_${dkey.id}_${index}_${getFieldIdentifier(f)}`, index: index }, (provided, snapshot) => {
        return React.createElement(OBPill, { dkey: dkey, fIndex: index, provided: provided });
    })))));
};
export default observer(OBFieldContainer);
//# sourceMappingURL=obFContainer.js.map