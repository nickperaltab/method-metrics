import React from 'react';
import DatasetTable from '../../components/dataTable';
import { observer } from 'mobx-react-lite';
import { useCompututaion, useVizStore } from '../../store';
import { toJS } from 'mobx';
const DatasetConfig = ({ hideProfiling }) => {
    const vizStore = useVizStore();
    const computation = useCompututaion();
    const metas = toJS(vizStore.meta);
    return (React.createElement("div", { className: "relative" },
        React.createElement(DatasetTable, { size: 100, metas: metas, computation: computation, displayOffset: vizStore.config.timezoneDisplayOffset, onMetaChange: (fid, fIndex, diffMeta) => {
                vizStore.updateCurrentDatasetMetas(fid, diffMeta);
            }, hideProfiling: hideProfiling })));
};
export default observer(DatasetConfig);
//# sourceMappingURL=index.js.map