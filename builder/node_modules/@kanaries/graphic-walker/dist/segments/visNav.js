import React, { useCallback } from "react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import EditableTabs from "../components/tabs/editableTab";
import { useVizStore } from "../store";
const ADD_KEY = '_add';
const VisNav = (props) => {
    const vizStore = useVizStore();
    const { currentVis, visLength, vizList } = vizStore;
    const { t } = useTranslation();
    const tabs = vizList.map((v) => ({
        key: v.visId,
        label: v.name ?? 'vis',
        editable: true
    }));
    tabs.push({
        key: ADD_KEY,
        label: t('main.tablist.new')
    });
    const visSelectionHandler = useCallback((tabKey, tabIndex) => {
        if (tabKey === ADD_KEY) {
            vizStore.addVisualization(idx => t('main.tablist.auto_title', { idx }));
        }
        else {
            vizStore.selectVisualization(tabIndex);
        }
    }, [vizStore, visLength]);
    const editLabelHandler = useCallback((content, tabIndex) => {
        vizStore.setVisName(tabIndex, content);
    }, [vizStore]);
    const deleteHandler = useCallback((tabIndex) => {
        vizStore.openRemoveConfirmModal(tabIndex);
    }, [vizStore]);
    const dupHandler = useCallback((tabIndex) => {
        vizStore.duplicateVisualization(tabIndex);
    }, [vizStore]);
    return (React.createElement(EditableTabs, { selectedKey: currentVis.visId, tabs: tabs, onEditLabel: editLabelHandler, onSelected: visSelectionHandler, onDuplicate: dupHandler, onRemove: deleteHandler, showRemove: visLength > 1 }));
};
export default observer(VisNav);
//# sourceMappingURL=visNav.js.map