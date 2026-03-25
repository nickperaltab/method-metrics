import { observer } from 'mobx-react-lite';
import React from 'react';
import { Draggable, Droppable, } from "@kanaries/react-beautiful-dnd";
import { useVizStore } from '../../store';
import { FilterFieldContainer, FilterFieldsContainer } from '../components';
import FilterPill from './filterPill';
import FilterEditDialog from './filterEditDialog';
import { refMapper } from '../fieldsContext';
import { getFieldIdentifier } from "../../utils";
const FilterItemContainer = observer(({ provided }) => {
    const vizStore = useVizStore();
    const { viewFilters: filters } = vizStore;
    return (React.createElement(FilterFieldsContainer, { className: 'touch-none', ...provided.droppableProps, ref: refMapper(provided.innerRef) },
        filters.map((f, index) => (React.createElement(Draggable, { key: `filters_${index}_${getFieldIdentifier(f)}`, draggableId: `filters_${index}_${getFieldIdentifier(f)}`, index: index }, (provided, snapshot) => {
            return (React.createElement(FilterPill, { fIndex: index, provided: provided }));
        }))),
        provided.placeholder,
        React.createElement(FilterEditDialog, null)));
});
const FilterField = () => {
    return (React.createElement("div", null,
        React.createElement(FilterFieldContainer, null,
            React.createElement(Droppable, { droppableId: "filters", direction: "vertical" }, (provided, snapshot) => (React.createElement(FilterItemContainer, { provided: provided }))))));
};
export default FilterField;
//# sourceMappingURL=index.js.map