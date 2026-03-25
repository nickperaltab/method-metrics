import React from 'react';
import { Droppable } from '@kanaries/react-beautiful-dnd';
import { useTranslation } from 'react-i18next';
import DimFields from './dimFields';
import MeaFields from './meaFields';
import { refMapper } from '../fieldsContext';
const DatasetFields = (props) => {
    const { t } = useTranslation('translation', { keyPrefix: 'main.tabpanel.DatasetFields' });
    return (React.createElement("div", { className: "p-1 sm:mr-0.5 my-0.5 border flex sm:flex-col sm:h-full", style: { paddingBlock: 0, paddingInline: '0.6em' } },
        React.createElement("h4", { className: "text-xs mb-2 flex-grow-0 cursor-default select-none mt-2" }, t('field_list')),
        React.createElement(Droppable, { droppableId: "dimensions", direction: "vertical" }, (provided, snapshot) => (React.createElement("div", { className: "flex-shrink min-w-[0px] min-h-[100px] sm:max-h-[380px] sm:overflow-y-auto", ...provided.droppableProps, ref: refMapper(provided.innerRef) },
            React.createElement("div", { className: "pd-1" },
                React.createElement(DimFields, null))))),
        React.createElement(Droppable, { droppableId: "measures", direction: "vertical" }, (provided, snapshot) => (React.createElement("div", { className: "flex-shrink flex-grow min-w-[0px] min-h-[200px] sm:overflow-y-auto flex-1", ...provided.droppableProps, ref: refMapper(provided.innerRef) },
            React.createElement("div", { className: "border-t flex-grow pd-1 overflow-y-auto h-full" },
                React.createElement(MeaFields, null)))))));
};
export default DatasetFields;
//# sourceMappingURL=index.js.map