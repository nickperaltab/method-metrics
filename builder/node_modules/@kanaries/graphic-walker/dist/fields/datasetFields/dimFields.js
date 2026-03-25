import React from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { Draggable } from '@kanaries/react-beautiful-dnd';
import { observer } from 'mobx-react-lite';
import { useVizStore } from '../../store';
import DataTypeIcon from '../../components/dataTypeIcon';
import ActionMenu from '../../components/actionMenu';
import { FieldPill } from './fieldPill';
import { useMenuActions } from './utils';
import { refMapper } from '../fieldsContext';
import { getFieldIdentifier } from "../../utils";
const DimFields = (props) => {
    const vizStore = useVizStore();
    const { dimensions } = vizStore;
    const menuActions = useMenuActions('dimensions');
    return (React.createElement("div", { className: "relative touch-none" }, dimensions.map((f, index) => (React.createElement(Draggable, { key: getFieldIdentifier(f), draggableId: `dimension_${getFieldIdentifier(f)}`, index: index }, (provided, snapshot) => {
        return (React.createElement(ActionMenu, { title: f.name || f.fid, menu: menuActions[index], enableContextMenu: false, disabled: snapshot.isDragging },
            React.createElement(FieldPill, { className: `touch-none flex pt-0.5 pb-0.5 pl-2 pr-2 mx-0 m-1 text-xs hover:bg-dimension/20 transition-colors rounded-md truncate border border-transparent ${snapshot.isDragging ? 'bg-dimension/20' : ''}`, ref: refMapper(provided.innerRef), isDragging: snapshot.isDragging, ...provided.draggableProps, ...provided.dragHandleProps },
                React.createElement(DataTypeIcon, { dataType: f.semanticType, analyticType: f.analyticType }),
                React.createElement("span", { className: "ml-0.5", title: f.name }, f.name),
                React.createElement(ActionMenu.Button, { as: "div" },
                    React.createElement(EllipsisVerticalIcon, { className: "w-4 h-4" }))),
            React.createElement(FieldPill, { className: `pt-0.5 pb-0.5 pl-2 pr-2 mx-0 m-1 text-xs hover:bg-dimension/20 rounded-full border border-dimension truncate ${snapshot.isDragging ? 'bg-dimension/20 flex' : 'hidden'}`, isDragging: snapshot.isDragging },
                React.createElement(DataTypeIcon, { dataType: f.semanticType, analyticType: f.analyticType }),
                React.createElement("span", { className: "ml-0.5", title: f.name }, f.name),
                React.createElement(ActionMenu.Button, { as: "div" },
                    React.createElement(EllipsisVerticalIcon, { className: "w-4 h-4" })))));
    })))));
};
export default observer(DimFields);
//# sourceMappingURL=dimFields.js.map