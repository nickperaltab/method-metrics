import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVizStore } from '../../store';
import Spinner from '../spinner';
import DropdownSelect from '../dropdownSelect';
import Dropzone from 'react-dropzone';
import { GeojsonRenderer } from './geojsonRenderer';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
const emptyList = [];
const GeoConfigPanel = ({ geoList = emptyList }) => {
    const vizStore = useVizStore();
    const { layout, showGeoJSONConfigPanel } = vizStore;
    const { geoKey, geojson, geoUrl } = layout;
    const { t: tGlobal } = useTranslation('translation');
    const { t } = useTranslation('translation', { keyPrefix: 'main.tabpanel.settings' });
    const [dataMode, setDataMode] = useState(geoUrl?.type ?? 'GeoJSON');
    const [featureId, setFeatureId] = useState('');
    const [url, setUrl] = useState(geoUrl?.url ?? '');
    const [geoJSON, setGeoJSON] = useState('');
    const [topoJSON, setTopoJSON] = useState('');
    const [topoJSONKey, setTopoJSONKey] = useState('');
    const [loadedUrl, setLoadedUrl] = useState(geoUrl);
    const [loading, setLoading] = useState(false);
    const hasCustomData = url || geojson;
    const [selectItem, setSelectItemR] = useState(() => {
        const i = geoList.findIndex((x) => x.url === geoUrl?.url && x.type === geoUrl?.type);
        if (i === -1 && hasCustomData) {
            return -2;
        }
        return i;
    });
    const options = useMemo(() => [{ label: 'Select a Geographic Data', value: '-1' }]
        .concat(geoList.map((x, i) => ({
        label: x.name,
        value: `${i}`,
    })))
        .concat({ label: 'Manual Configuration', value: '-2' }), [geoList]);
    const setSelectItem = useMemo(() => (a) => setSelectItemR(parseInt(a)), []);
    const isCustom = (geoList ?? []).length === 0 || selectItem === -2;
    const defaultTopoJSONKey = useMemo(() => {
        try {
            const value = JSON.parse(topoJSON);
            return Object.keys(value.objects)[0] || '';
        }
        catch (error) {
            return '';
        }
    }, [topoJSON]);
    useEffect(() => {
        setFeatureId(geoKey || '');
    }, [geoKey]);
    useEffect(() => {
        setGeoJSON(geojson ? JSON.stringify(geojson, null, 2) : '');
    }, [geojson]);
    const handleSubmit = () => {
        if (!isCustom) {
            const item = geoList[selectItem];
            if (!item) {
                vizStore.clearGeographicData();
                vizStore.updateGeoKey(featureId);
            }
            else {
                vizStore.setVisualLayout('geoUrl', {
                    type: item.type,
                    url: item.url,
                });
            }
            vizStore.setShowGeoJSONConfigPanel(false);
            return;
        }
        try {
            if (!(dataMode === 'GeoJSON' ? geoJSON : topoJSON) && loadedUrl) {
                vizStore.setShowGeoJSONConfigPanel(false);
                return;
            }
            const json = JSON.parse(dataMode === 'GeoJSON' ? geoJSON : topoJSON);
            if (dataMode === 'TopoJSON') {
                vizStore.setGeographicData({
                    type: 'TopoJSON',
                    data: json,
                    objectKey: topoJSONKey || defaultTopoJSONKey,
                }, featureId, loadedUrl?.type === 'TopoJSON' ? loadedUrl : undefined);
            }
            else {
                vizStore.setGeographicData({
                    type: 'GeoJSON',
                    data: json,
                }, featureId, loadedUrl?.type === 'GeoJSON' ? loadedUrl : undefined);
            }
            vizStore.setShowGeoJSONConfigPanel(false);
        }
        catch (err) {
            console.error(err);
        }
    };
    return (React.createElement(Dialog, { open: showGeoJSONConfigPanel, onOpenChange: () => {
            vizStore.setShowGeoJSONConfigPanel(false);
        } },
        React.createElement(DialogContent, null,
            React.createElement("h2", { className: "text-lg mb-4" }, t('geography')),
            React.createElement("div", null,
                React.createElement("div", { className: "my-2" },
                    React.createElement("label", { className: "block text-xs font-medium leading-6" }, t('geography_settings.geoKey')),
                    React.createElement("div", { className: "mt-1" },
                        React.createElement(Input, { type: "text", value: featureId, onChange: (e) => setFeatureId(e.target.value) }))),
                geoList.length > 0 && (React.createElement("div", { className: "my-2" },
                    React.createElement("label", { className: "block text-xs font-medium leading-6" }, "GeoData"),
                    React.createElement(DropdownSelect, { options: options, selectedKey: `${selectItem}`, onSelect: setSelectItem }))),
                !isCustom && selectItem >= 0 && (React.createElement("div", { className: `relative justify-center flex w-full h-80 rounded border shadow-sm` },
                    React.createElement(GeojsonRenderer, { type: geoList[selectItem].type, url: geoList[selectItem] }))),
                isCustom && (React.createElement("div", { className: "my-2" },
                    React.createElement("label", { className: "block text-xs font-medium leading-6" }, t(`geography_settings.${dataMode.toLowerCase()}`)),
                    React.createElement("div", { className: "mt-1 flex flex-col space-y-2" },
                        React.createElement("div", { role: "radiogroup" },
                            React.createElement(RadioGroup, { value: dataMode, onValueChange: (v) => setDataMode(v), className: "flex items-center space-x-2" },
                                React.createElement(RadioGroupItem, { value: "GeoJSON", id: "geojson" }),
                                React.createElement("label", { htmlFor: "geojson", className: "text-xs whitespace-nowrap" }, t('geography_settings.geojson')),
                                React.createElement(RadioGroupItem, { value: "TopoJSON", id: "topojson" }),
                                React.createElement("label", { htmlFor: "topojson", className: "text-xs whitespace-nowrap" }, t('geography_settings.topojson')))),
                        React.createElement("div", { className: "flex items-center space-x-2" },
                            React.createElement("label", { className: "text-xs whitespace-nowrap capitalize" }, t('geography_settings.href', { format: dataMode.toLowerCase() })),
                            React.createElement(Input, { type: "text", value: url, placeholder: t('geography_settings.hrefPlaceholder', { format: dataMode.toLowerCase() }), onChange: (e) => {
                                    setUrl(e.target.value);
                                } }),
                            React.createElement(Button, { className: "mr-2 flex-shrink-0", disabled: loading, onClick: () => {
                                    if (url) {
                                        setLoading(true);
                                        fetch(url)
                                            .then((res) => res.json())
                                            .then((json) => {
                                            (dataMode === 'GeoJSON' ? setGeoJSON : setTopoJSON)(JSON.stringify(json, null, 2));
                                            setLoadedUrl({ type: dataMode, url });
                                            setLoading(false);
                                        })
                                            .catch(() => {
                                            setLoading(false);
                                        });
                                    }
                                } },
                                loading && React.createElement(Spinner, null),
                                t('geography_settings.load'))),
                        React.createElement(Dropzone, { onDrop: (acceptedFiles) => {
                                const f = acceptedFiles[0];
                                if (f) {
                                    const reader = new FileReader();
                                    reader.addEventListener('load', (event) => {
                                        const data = event.target.result;
                                        setLoadedUrl(undefined);
                                        (dataMode === 'GeoJSON' ? setGeoJSON : setTopoJSON)(data);
                                    });
                                    reader.readAsText(f);
                                }
                            }, noClick: true }, ({ getRootProps, getInputProps, isDragActive, open }) => (React.createElement("div", { className: `relative justify-center flex w-full h-80 rounded border shadow-sm`, ...getRootProps() },
                            isDragActive && (React.createElement("div", { className: "absolute items-center justify-center left-0 right-0 top-0 bottom-0 z-20 bg-accent opacity-80" })),
                            React.createElement("input", { ...getInputProps() }),
                            React.createElement("div", { onClick: open, className: "flex h-full items-center justify-center w-48" }, t('geography_settings.jsonInputPlaceholder', { format: dataMode.toLowerCase() })),
                            React.createElement(GeojsonRenderer, { data: dataMode === 'GeoJSON' ? geoJSON : topoJSON, type: dataMode, url: loadedUrl })))),
                        dataMode === 'TopoJSON' && (React.createElement("div", { className: "flex items-center space-x-2" },
                            React.createElement("label", { className: "text-xs whitespace-nowrap capitalize" }, t('geography_settings.objectKey')),
                            React.createElement(Input, { type: "text", value: topoJSONKey, placeholder: defaultTopoJSONKey, onChange: (e) => {
                                    setTopoJSONKey(e.target.value);
                                } }))))))),
            React.createElement(DialogFooter, null,
                React.createElement(Button, { children: tGlobal('actions.confirm'), onClick: handleSubmit }),
                React.createElement(Button, { children: tGlobal('actions.cancel'), variant: "outline", onClick: () => {
                        vizStore.setShowGeoJSONConfigPanel(false);
                    } })))));
};
export default observer(GeoConfigPanel);
//# sourceMappingURL=geoConfigPanel.js.map