import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../utils/save';
import GwFile from './dataSelection/gwFile';
import DataSelection from './dataSelection';
import DropdownSelect from '../components/dropdownSelect';
import { IDataSourceEventType } from '../interfaces';
import { ShadowDom } from '../shadow-dom';
import { CommonStore } from '../store/commonStore';
import { useCurrentMediaTheme } from '../utils/media';
import { composeContext } from '../utils/context';
import { portalContainerContext, themeContext, vegaThemeContext } from '../store/theme';
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
const DataSourceSegment = observer((props) => {
    const { commonStore, dataSources, onSelectId, selectedId, onLoad, onSave } = props;
    const gwFileRef = useRef(null);
    const { t } = useTranslation();
    const { showDSPanel } = commonStore;
    return (React.createElement("div", { className: "font-sans gap-2 flex flex-wrap items-center m-4 p-4 border rounded-md" },
        props.onLoad && React.createElement(GwFile, { onImport: props.onLoad, fileRef: gwFileRef }),
        React.createElement("div", null,
            React.createElement(DropdownSelect, { className: "text-xs !h-8", options: dataSources.map((d) => ({ label: d.name, value: d.id })), selectedKey: selectedId, onSelect: onSelectId, placeholder: t('DataSource.labels.cur_dataset') })),
        React.createElement(Button, { size: "sm", onClick: () => {
                commonStore.startDSBuildingTask();
            } }, t('DataSource.buttons.create_dataset')),
        onSave && (React.createElement(Button, { size: "sm", variant: "outline", onClick: async () => {
                const blob = await onSave();
                downloadBlob(blob, 'graphic-walker-notebook.json');
            } }, t('DataSource.buttons.export_as_file'))),
        props.onLoad && (React.createElement(Button, { size: "sm", variant: "outline", onClick: () => {
                if (gwFileRef.current) {
                    gwFileRef.current.click();
                }
            } }, t('DataSource.buttons.import_file'))),
        React.createElement(Dialog, { onOpenChange: () => {
                commonStore.setShowDSPanel(false);
            }, open: showDSPanel },
            React.createElement(DialogContent, null,
                React.createElement(DialogHeader, null,
                    React.createElement(DialogTitle, null, t('DataSource.dialog.create_data_source'))),
                React.createElement(DataSelection, { commonStore: commonStore })))));
});
function once(register, cb) {
    const disposer = { current: () => { } };
    const newCB = (...args) => {
        const result = cb(...args);
        disposer.current();
        return result;
    };
    disposer.current = register(newCB);
}
const DataSourceThemeContext = composeContext({ themeContext, vegaThemeContext, portalContainerContext });
export function DataSourceSegmentComponent(props) {
    const [selectedId, setSelectedId] = useState('');
    const [datasetList, setDatasetList] = useState([]);
    useEffect(() => {
        props.provider.getDataSourceList().then(setDatasetList);
        return props.provider.registerCallback((e) => {
            if (e & IDataSourceEventType.updateList) {
                props.provider.getDataSourceList().then(setDatasetList);
            }
        });
    }, [props.provider]);
    const dataset = useMemo(() => datasetList.find((x) => x.id === selectedId), [datasetList, selectedId]);
    const [computationID, refreshComputation] = useReducer((x) => x + 1, 0);
    const [meta, setMeta] = useState([]);
    const vizSpecStoreRef = useRef(null);
    useEffect(() => {
        if (dataset) {
            const { provider } = props;
            provider.getMeta(dataset.id).then(setMeta);
            provider.getSpecs(dataset.id).then((x) => {
                vizSpecStoreRef.current?.importRaw(JSON.parse(x));
            });
            const disposer = provider.registerCallback((e, datasetId) => {
                if (dataset.id === datasetId) {
                    if (e & IDataSourceEventType.updateData) {
                        refreshComputation();
                    }
                    if (e & IDataSourceEventType.updateMeta) {
                        provider.getMeta(datasetId).then(setMeta);
                    }
                    if (e & IDataSourceEventType.updateSpec) {
                        provider.getSpecs(datasetId).then((x) => (x) => {
                            vizSpecStoreRef.current?.importRaw(JSON.parse(x));
                        });
                    }
                }
            });
            return () => {
                disposer();
                const data = vizSpecStoreRef.current?.exportAllCharts();
                data && provider.saveSpecs(dataset.id, JSON.stringify(data));
            };
        }
    }, [dataset, props.provider]);
    const computation = useMemo(() => async (payload) => {
        return selectedId ? props.provider.queryData(payload, [selectedId]) : [];
    }, [computationID, props.provider, selectedId]);
    const onMetaChange = useCallback((fid, meta) => {
        setMeta((x) => {
            const result = x.map((f) => (f.fid === fid ? { ...f, ...meta } : f));
            props.provider.setMeta(selectedId, result);
            return result;
        });
    }, [props.provider, selectedId]);
    const commonStore = useMemo(() => new CommonStore(props.provider, setSelectedId, { displayOffset: props.displayOffset }), [props.provider]);
    useEffect(() => {
        commonStore.setDisplayOffset(props.displayOffset);
    }, [props.displayOffset, commonStore]);
    const onLoad = useMemo(() => {
        const importFile = props.provider.onImportFile;
        if (importFile) {
            return (file) => {
                importFile(file);
                once(props.provider.registerCallback, (e) => {
                    if (e & IDataSourceEventType.updateList) {
                        props.provider.getDataSourceList().then(([first]) => setSelectedId(first.id));
                    }
                });
            };
        }
    }, [props.provider]);
    const onSave = useMemo(() => {
        const exportFile = props.provider.onExportFile;
        const saveSpecs = props.provider.saveSpecs;
        if (exportFile) {
            return async () => {
                const data = vizSpecStoreRef.current?.exportAllCharts();
                if (data) {
                    await saveSpecs(selectedId, JSON.stringify(data));
                }
                return exportFile();
            };
        }
    }, [selectedId, props.provider]);
    const syncSpecs = useCallback(() => {
        const data = vizSpecStoreRef.current?.exportAllCharts();
        if (data) {
            props.provider.saveSpecs(selectedId, JSON.stringify(data));
        }
    }, [selectedId, props.provider]);
    const darkMode = useCurrentMediaTheme(props.appearance ?? props.dark);
    const [currentTheme, setCurrentTheme] = useState((props.vizThemeConfig ?? props.themeConfig ?? props.themeKey));
    const [portal, setPortal] = useState(null);
    return (React.createElement(React.Fragment, null,
        React.createElement(ShadowDom, { uiTheme: props.uiTheme ?? props.colorConfig },
            React.createElement(DataSourceThemeContext, { themeContext: darkMode, vegaThemeContext: { vizThemeConfig: currentTheme, setVizThemeConfig: setCurrentTheme }, portalContainerContext: portal },
                React.createElement("div", { className: `${darkMode === 'dark' ? 'dark' : ''} App` },
                    React.createElement(DataSourceSegment, { commonStore: commonStore, dataSources: datasetList, onSelectId: setSelectedId, selectedId: selectedId, onLoad: onLoad, onSave: onSave }),
                    React.createElement("div", { ref: setPortal })))),
        React.createElement(props.children, { computation: computation, datasetName: dataset?.name ?? '', meta: meta, onMetaChange: onMetaChange, storeRef: vizSpecStoreRef, syncSpecs: syncSpecs })));
}
export default DataSourceSegment;
//# sourceMappingURL=index.js.map