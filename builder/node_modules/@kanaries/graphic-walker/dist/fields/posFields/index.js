import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { Droppable } from '@kanaries/react-beautiful-dnd';
import { useVizStore } from '../../store';
import { FieldListContainer } from '../components';
import { DRAGGABLE_STATE_KEYS } from '../fieldsContext';
import OBFieldContainer from '../obComponents/obFContainer';
const PosFields = (props) => {
    const vizStore = useVizStore();
    const { config } = vizStore;
    const { geoms, coordSystem = 'generic' } = config;
    const channels = useMemo(() => {
        if (coordSystem === 'geographic') {
            if (geoms[0] === 'choropleth') {
                return DRAGGABLE_STATE_KEYS.filter((f) => f.id === 'geoId');
            }
            return DRAGGABLE_STATE_KEYS.filter((f) => f.id === 'longitude' || f.id === 'latitude');
        }
        if (geoms[0] === 'arc') {
            return DRAGGABLE_STATE_KEYS.filter((f) => f.id === 'radius' || f.id === 'theta');
        }
        return DRAGGABLE_STATE_KEYS.filter((f) => f.id === 'columns' || f.id === 'rows');
    }, [geoms[0], coordSystem]);
    return (React.createElement("div", null, channels.map((dkey, i) => (React.createElement(FieldListContainer, { name: dkey.id, key: dkey.id },
        React.createElement(Droppable, { droppableId: dkey.id, direction: "horizontal" }, (provided, snapshot) => React.createElement(OBFieldContainer, { dkey: dkey, provided: provided })))))));
};
export default observer(PosFields);
//# sourceMappingURL=index.js.map