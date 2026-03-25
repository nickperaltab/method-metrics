import React, { useRef, useCallback, useState } from 'react';
import { FileReader } from '@kanaries/web-data-loader';
import Table from '../table';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import DropdownSelect from '../../components/dropdownSelect';
import { charsetOptions } from './config';
import { jsonReader } from './utils';
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
const CSVData = ({ commonStore }) => {
    const fileRef = useRef(null);
    const { tmpDSName, tmpDataSource, tmpDSRawFields } = commonStore;
    const [encoding, setEncoding] = useState('utf-8');
    const onSubmitData = useCallback(() => {
        commonStore.commitTempDS();
    }, [commonStore]);
    const { t } = useTranslation('translation', { keyPrefix: 'DataSource.dialog.file' });
    const fileLoaded = tmpDataSource.length > 0 && tmpDSRawFields.length > 0;
    const fileUpload = useCallback((e) => {
        const files = e.target.files;
        if (files !== null) {
            const file = files[0];
            const name = file.name.toLowerCase();
            const ext = name.endsWith('.json') ? 'json' : 'csv';
            if (ext === 'csv') {
                FileReader.csvReader({
                    file,
                    config: { type: 'reservoirSampling', size: Infinity },
                    onLoading: () => { },
                    encoding,
                }).then((data) => {
                    commonStore.updateTempDS(data);
                });
            }
            else {
                jsonReader(file).then((data) => {
                    commonStore.updateTempDS(data);
                });
            }
        }
    }, [commonStore, encoding]);
    return (React.createElement("div", { className: "min-h-[300px]" },
        !fileLoaded && (React.createElement("div", { className: "text-center" },
            React.createElement("svg", { className: "mx-auto h-12 w-12 text-muted-foreground", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", "aria-hidden": "true" },
                React.createElement("path", { vectorEffect: "non-scaling-stroke", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" })),
            React.createElement("h3", { className: "mt-2 text-sm font-semibold text-foreground" }, t('choose_file')),
            React.createElement("p", { className: "mt-1 text-sm text-muted-foreground" }, t('get_start_desc')))),
        React.createElement("input", { style: { display: 'none' }, type: "file", ref: fileRef, onChange: fileUpload, accept: ".csv,.json" }),
        !fileLoaded && (React.createElement("div", { className: "my-1" },
            React.createElement("div", { className: "flex flex-col items-center gap-1 w-fit mx-auto" },
                React.createElement("div", { className: "flex w-full" },
                    React.createElement(Button, { className: "mr-2", variant: "outline", onClick: () => {
                            if (fileRef.current) {
                                fileRef.current.click();
                            }
                        } }, t('open')),
                    React.createElement("div", { className: "relative flex-grow" },
                        React.createElement(DropdownSelect, { className: "w-full", options: charsetOptions, selectedKey: encoding, onSelect: (k) => {
                                setEncoding(k);
                            } })))))),
        fileLoaded && (React.createElement("div", { className: "mb-2 mt-6" },
            React.createElement("label", { className: "block text-xs text-secondary-foreground mb-1 font-bold" }, t('dataset_name')),
            React.createElement("div", { className: "flex space-x-2" },
                React.createElement(Input, { type: "text", placeholder: t('dataset_name'), value: tmpDSName, onChange: (e) => {
                        commonStore.updateTempName(e.target.value);
                    }, className: "text-xs placeholder:italic w-36" }),
                React.createElement(Button, { disabled: tmpDataSource.length === 0, onClick: () => {
                        onSubmitData();
                    } }, t('submit'))))),
        fileLoaded && React.createElement(Table, { commonStore: commonStore })));
};
export default observer(CSVData);
//# sourceMappingURL=csvData.js.map